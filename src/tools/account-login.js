import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { ensurePageStandalone } from "../state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Credentials and screenshots are stored relative to the MCP server root
const ACCOUNTS_FILE = path.resolve(__dirname, "../../test-accounts.json");
const SCREENSHOTS_DIR = path.resolve(__dirname, "../../screenshots");

// Ensure the screenshots directory exists before saving any screenshot
function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

function buildScreenshotPath(label) {
  ensureScreenshotsDir();
  return path.join(SCREENSHOTS_DIR, `${label}-${Date.now()}.png`);
}

// Guerrilla Mail API base — no browser required, no bot-blocking
const GUERRILLA_API = "https://api.guerrillamail.com/ajax.php";

// Ordered list of selectors to probe for email inputs
const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[placeholder*="email" i]',
  'input[id*="email" i]',
  'input[autocomplete="email"]',
  'input[name*="email" i]',
];

// Ordered list of selectors to probe for password inputs
const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[id*="password" i]',
  'input[name*="pass" i]',
];

// Selectors for submit buttons (type-based)
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
];

// Text labels used on submit buttons across various sites
const SUBMIT_BUTTON_TEXTS = [
  "Sign up",
  "Create account",
  "Register",
  "Continue",
  "Next",
  "Get started",
  "Join",
  "Submit",
];

// Phrases that indicate the site wants email verification before login
const VERIFICATION_PHRASES = [
  "verify your email",
  "check your email",
  "verification link",
  "confirm your email",
  "email confirmation",
  "sent you an email",
  "please verify",
  "activate your account",
  "verification email",
];

// Phrases that indicate a login attempt has failed (wrong creds or deleted account)
const LOGIN_FAILURE_PHRASES = [
  "invalid",
  "incorrect",
  "not found",
  "no account",
  "doesn't exist",
  "does not exist",
  "wrong password",
  "wrong email",
  "account not found",
];

// ---------- credential store helpers ----------

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return {};
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");
}

// ---------- password generator ----------

function generateStrongPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()_+-=";
  const allChars = upper + lower + digits + special;

  // Guarantee at least one character from each category
  const pickFrom = (charset) => charset[crypto.randomInt(charset.length)];
  const mandatoryChars = [
    pickFrom(upper),
    pickFrom(lower),
    pickFrom(digits),
    pickFrom(special),
  ];

  const randomChars = Array.from({ length: 12 }, () => pickFrom(allChars));

  // Shuffle mandatory + random chars together so the mandatory ones aren't always at the front
  const allPasswordChars = [...mandatoryChars, ...randomChars];
  for (let i = allPasswordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [allPasswordChars[i], allPasswordChars[j]] = [allPasswordChars[j], allPasswordChars[i]];
  }

  return allPasswordChars.join("");
}

// ---------- DOM interaction helpers ----------

/**
 * Returns the first visible element matching any of the provided selectors,
 * or null if none are found. Used to check presence without throwing.
 */
async function findVisibleElement(page, selectors) {
  for (const selector of selectors) {
    const el = await page.$(selector);
    if (!el) continue;
    const visible = await el.isVisible().catch(() => false);
    if (visible) return el;
  }
  return null;
}

/**
 * Fills an input field located by trying selectors in order.
 * If no common selector matches, dumps all inputs from the DOM to help diagnose.
 */
async function fillInput(page, selectors, value, fieldLabel) {
  const el = await findVisibleElement(page, selectors);

  if (el) {
    await el.fill(value);
    return;
  }

  // Fallback: dump input metadata so the caller can diagnose and pass explicit selectors
  const allInputs = await page.$$eval("input", (elements) =>
    elements.map((el) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      autocomplete: el.autocomplete,
    }))
  );

  throw new Error(
    `Could not find a visible ${fieldLabel} input using common selectors.\n` +
    `Available inputs on page:\n${JSON.stringify(allInputs, null, 2)}\n` +
    `Pass an explicit ${fieldLabel}_selector to resolve this.`
  );
}

/**
 * Clicks the submit button using type-based selectors first,
 * then falls back to matching visible buttons by their text label.
 */
async function clickSubmitButton(page, customSelector) {
  if (customSelector) {
    await page.click(customSelector);
    return;
  }

  // Try attribute-based selectors first
  const attrMatch = await findVisibleElement(page, SUBMIT_SELECTORS);
  if (attrMatch) {
    await attrMatch.click();
    return;
  }

  // Try text-based button matching
  for (const label of SUBMIT_BUTTON_TEXTS) {
    const btn = page.getByRole("button", { name: label, exact: false }).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
      return;
    }
  }

  throw new Error(
    "Could not find a submit button using common selectors or text labels. " +
    "Pass an explicit submit_selector to resolve this."
  );
}

/**
 * Returns true if the current page text contains any phrase
 * that signals the site wants the user to verify their email.
 */
async function pageRequiresVerification(page) {
  const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
  return VERIFICATION_PHRASES.some((phrase) => pageText.includes(phrase));
}

/**
 * Returns true if the current page text contains any phrase
 * that signals a login attempt failed.
 */
async function pageShowsLoginFailure(page) {
  const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
  return LOGIN_FAILURE_PHRASES.some((phrase) => pageText.includes(phrase));
}

// ---------- Guerrilla Mail API helpers ----------
// These use the Guerrilla Mail REST API directly from Node — no browser required.
// API docs: https://www.guerrillamail.com/GuerrillaMailAPI.html

/**
 * Creates a new Guerrilla Mail session and returns { email, sidToken }.
 * sidToken must be passed to subsequent API calls to maintain the inbox session.
 */
async function createGuerrillaSession() {
  const response = await fetch(`${GUERRILLA_API}?f=get_email_address`);
  const data = await response.json();
  return {
    email: data.email_addr,
    sidToken: data.sid_token,
  };
}

/**
 * Polls the Guerrilla Mail inbox until a verification email arrives.
 * Returns the first href that looks like a verify/confirm/activate/token URL.
 * Polls every 3s up to 60s.
 */
async function extractVerificationLink(sidToken) {
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const listUrl = `${GUERRILLA_API}?f=get_email_list&offset=0&sid_token=${sidToken}`;
    const listResponse = await fetch(listUrl);
    const listData = await listResponse.json();

    const emails = listData.list || [];

    if (emails.length > 0) {
      // Fetch the full body of the first email
      const emailId = emails[0].mail_id;
      const fetchUrl = `${GUERRILLA_API}?f=fetch_email&email_id=${emailId}&sid_token=${sidToken}`;
      const fetchResponse = await fetch(fetchUrl);
      const emailData = await fetchResponse.json();

      const body = emailData.mail_body || "";

      // Extract all hrefs from anchor tags in the email body
      const hrefMatches = [...body.matchAll(/href=["']([^"']+)["']/gi)];
      const hrefs = hrefMatches.map((match) => match[1]);

      // Prefer links that look like verification URLs
      const verifyHref = hrefs.find((href) =>
        href.includes("verify") ||
        href.includes("confirm") ||
        href.includes("activate") ||
        href.includes("token")
      );
      if (verifyHref) return verifyHref;

      // Fallback: return the first external link
      const firstExternal = hrefs.find(
        (href) => href.startsWith("http") && !href.includes("guerrillamail")
      );
      if (firstExternal) return firstExternal;
    }

    // Wait 3s before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(
    "Timed out waiting for verification email in Guerrilla Mail inbox (60s). " +
    "The email may not have arrived yet."
  );
}

// ---------- core account creation flow ----------

/**
 * Full flow: get temp email → navigate to signup → fill form (1 or 2 steps) →
 * handle verification if needed → save credentials.
 * Returns a human-readable result string.
 */
async function createNewAccount(page, args, accounts, key) {
  // Get a disposable email address via Guerrilla Mail API (no browser navigation needed)
  const { email: tempEmail, sidToken } = await createGuerrillaSession();

  const password = generateStrongPassword();

  // Navigate to the signup page
  await page.goto(args.signup_url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Click a pre-signup trigger (e.g. a "Join Now" button that opens a modal) if specified
  if (args.pre_click_selector) {
    await page.click(args.pre_click_selector);
    await page.waitForTimeout(1000);
  }

  const emailSelectors = args.email_selector ? [args.email_selector] : EMAIL_SELECTORS;
  const passwordSelectors = args.password_selector ? [args.password_selector] : PASSWORD_SELECTORS;

  // Fill the email field
  await fillInput(page, emailSelectors, tempEmail, "email");

  // Check if a password field is already visible on this page (single-step form)
  const passwordFieldOnStep1 = await findVisibleElement(page, passwordSelectors);
  if (passwordFieldOnStep1) {
    await passwordFieldOnStep1.fill(password);
  }

  // Submit step 1
  await clickSubmitButton(page, args.submit_selector);
  await page.waitForTimeout(2000);

  // Handle multi-step forms where the password appears on a second page
  const onStep2Already = args.step2_url != null;
  const passwordMissingOnStep1 = passwordFieldOnStep1 == null;

  if (onStep2Already || passwordMissingOnStep1) {
    if (args.step2_url) {
      await page.goto(args.step2_url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
    }

    const step2PasswordSelectors = args.step2_password_selector
      ? [args.step2_password_selector]
      : passwordSelectors;

    const step2PasswordField = await findVisibleElement(page, step2PasswordSelectors);
    if (step2PasswordField) {
      await step2PasswordField.fill(password);
      await clickSubmitButton(page, args.step2_submit_selector);
      await page.waitForTimeout(2000);
    }
  }

  const screenshotPath = buildScreenshotPath(`account-created-${key}`);
  await page.screenshot({ path: screenshotPath });

  const verificationNeeded = await pageRequiresVerification(page);

  let verifiedAt = null;
  let verificationNote = "No email verification was required.";

  if (verificationNeeded) {
    verificationNote = "Site requested email verification — polling Guerrilla Mail inbox...";

    try {
      const verifyLink = await extractVerificationLink(sidToken);
      await page.goto(verifyLink, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      verifiedAt = new Date().toISOString();
      verificationNote = `Email verified successfully at ${verifiedAt}`;
    } catch (verifyError) {
      // Save credentials anyway so the user can retry verification manually
      accounts[key] = buildCredentialEntry(
        tempEmail,
        password,
        args,
        false,
        null,
        verifyError.message
      );
      saveAccounts(accounts);

      return (
        `Account created for "${key}" but verification failed.\n` +
        `Error: ${verifyError.message}\n` +
        `Credentials saved so you can retry manually.\n` +
        `Email: ${tempEmail}\n` +
        `Screenshot: ${screenshotPath}`
      );
    }
  }

  accounts[key] = buildCredentialEntry(tempEmail, password, args, verifiedAt != null, verifiedAt, null);
  saveAccounts(accounts);

  return (
    `Account created for "${key}".\n` +
    `Email: ${tempEmail}\n` +
    `${verificationNote}\n` +
    `Credentials saved to test-accounts.json\n` +
    `Screenshot: ${screenshotPath}`
  );
}

function buildCredentialEntry(email, password, args, verified, verifiedAt, verificationError) {
  return {
    email,
    password,
    signup_url: args.signup_url || null,
    login_url: args.login_url || null,
    created_at: new Date().toISOString(),
    verified,
    verified_at: verifiedAt,
    verification_error: verificationError || null,
  };
}

// ---------- tool definition + handler ----------

export const definition = {
  name: "test_account_login",
  description:
    "Create or reuse a test account for a website using a disposable email from temp-mail.org. " +
    "Credentials are stored in test-accounts.json and reused across test sessions. " +
    "Use action='auto' to login if credentials exist or create new ones if they don't.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["auto", "create", "login"],
        description:
          "auto: use stored credentials or create new (also re-creates if login fails). " +
          "create: always create a new account. " +
          "login: use stored credentials only — fails if none exist.",
      },
      account_key: {
        type: "string",
        description:
          "Unique identifier for this account (e.g. 'jobright_main'). " +
          "Used to store and retrieve credentials across sessions.",
      },
      signup_url: {
        type: "string",
        description: "URL of the signup/registration page. Required for 'create' and 'auto' actions.",
      },
      login_url: {
        type: "string",
        description: "URL of the login page. Required for 'login'; also used by 'auto' after account creation.",
      },
      pre_click_selector: {
        type: "string",
        description: "CSS selector for a button/link to click after navigation before the signup form appears (e.g. a 'Join Now' button that opens a modal). Optional.",
      },
      email_selector: {
        type: "string",
        description: "CSS selector for the email input field. Auto-detected if omitted.",
      },
      password_selector: {
        type: "string",
        description: "CSS selector for the password input field. Auto-detected if omitted.",
      },
      submit_selector: {
        type: "string",
        description: "CSS selector for the submit button. Auto-detected if omitted.",
      },
      step2_url: {
        type: "string",
        description:
          "URL of a second signup page for multi-step forms where the password is on a separate page. Optional.",
      },
      step2_password_selector: {
        type: "string",
        description: "CSS selector for the password field on step 2 of a multi-step signup form. Optional.",
      },
      step2_submit_selector: {
        type: "string",
        description: "CSS selector for the submit button on step 2. Optional.",
      },
    },
    required: ["action", "account_key"],
  },
};

export async function handler(args) {
  const page = await ensurePageStandalone();
  const accounts = loadAccounts();
  const key = args.account_key;

  // ── LOGIN path ──────────────────────────────────────────────────────────────
  const shouldAttemptLogin =
    args.action === "login" || (args.action === "auto" && accounts[key]);

  if (shouldAttemptLogin) {
    const storedCreds = accounts[key];

    if (!storedCreds) {
      return {
        content: [{
          type: "text",
          text:
            `No stored credentials found for "${key}". ` +
            `Use action: "create" or "auto" to create an account first.`,
        }],
      };
    }

    const loginUrl = args.login_url || storedCreds.login_url;
    if (!loginUrl) {
      return {
        content: [{
          type: "text",
          text:
            `No login_url provided and none stored for "${key}". ` +
            `Pass login_url as an argument.`,
        }],
      };
    }

    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const emailSelectors = args.email_selector ? [args.email_selector] : EMAIL_SELECTORS;
    const passwordSelectors = args.password_selector ? [args.password_selector] : PASSWORD_SELECTORS;

    try {
      await fillInput(page, emailSelectors, storedCreds.email, "email");
      await fillInput(page, passwordSelectors, storedCreds.password, "password");
      await clickSubmitButton(page, args.submit_selector);
      await page.waitForTimeout(2000);
    } catch (formError) {
      const screenshotPath = buildScreenshotPath(`login-form-error-${key}`);
      await page.screenshot({ path: screenshotPath });
      return {
        content: [{
          type: "text",
          text:
            `Login form interaction failed for "${key}": ${formError.message}\n` +
            `Screenshot: ${screenshotPath}`,
        }],
      };
    }

    const screenshotPath = buildScreenshotPath(`login-${key}`);
    await page.screenshot({ path: screenshotPath });

    const loginFailed = await pageShowsLoginFailure(page);

    // If login failed and we're in auto mode, the account may have been deleted — recreate it
    if (loginFailed && args.action === "auto") {
      const recreateResult = await createNewAccount(page, args, accounts, key);
      return {
        content: [{
          type: "text",
          text:
            `Login failed for "${key}" (account may have been deleted). Recreating...\n\n` +
            recreateResult,
        }],
      };
    }

    if (loginFailed) {
      return {
        content: [{
          type: "text",
          text:
            `Login failed for "${key}". ` +
            `The stored account (${storedCreds.email}) may have been deleted. ` +
            `Use action: "create" to generate a new account.\n` +
            `Screenshot: ${screenshotPath}`,
        }],
      };
    }

    const verificationNeeded = await pageRequiresVerification(page);
    if (verificationNeeded) {
      return {
        content: [{
          type: "text",
          text:
            `Logged in but the site is asking for email verification.\n` +
            `Navigate to temp-mail.org to find and click the verification link.\n` +
            `Screenshot: ${screenshotPath}`,
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: `Login successful for "${key}" (${storedCreds.email}).\nScreenshot: ${screenshotPath}`,
      }],
    };
  }

  // ── CREATE path ─────────────────────────────────────────────────────────────
  if (args.action === "create" || args.action === "auto") {
    if (!args.signup_url) {
      return {
        content: [{
          type: "text",
          text: `signup_url is required when action is "${args.action}".`,
        }],
      };
    }

    const result = await createNewAccount(page, args, accounts, key);
    return { content: [{ type: "text", text: result }] };
  }

  return {
    content: [{
      type: "text",
      text: `Unknown action: "${args.action}". Valid values are "auto", "create", or "login".`,
    }],
  };
}
