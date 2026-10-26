# Job Tracker

A free, phone-friendly page that lists every job you apply to on LinkedIn and Indeed, with its title, company, date applied, and status (**Applied**, **Interview**, **Rejected**, or **No reply**).

You never type jobs in. A robot in your private `job-tracker-data` repo checks your email every 30 minutes, picks up the "application sent" emails from LinkedIn and Indeed, and watches for rejection emails from employers. An email inviting you to interview moves a job to **Interview**. Jobs with no answer after 30 days move to **No reply**. If it gets one wrong, tap the status on the page to fix it; your choice is never overwritten. Pick **↺ Auto** to hand it back to the robot.

Open it at **https://koalaonee.github.io/job-tracker/** and use "Add to Home Screen" so it feels like an app.

## How it fits together

| Repo | Visibility | Holds |
| --- | --- | --- |
| `job-tracker` (this one) | public | The web page only. No job data. |
| `job-tracker-data` | private | Your job list, the email robot, and your (encrypted) Outlook sign-ins. |

The page reads your list straight from the private repo using a GitHub key you paste in once per device. The key is saved only in that device's browser.

## Setup

Doing steps 2 and 3 on a computer is easiest. Everything after that works from your phone.

1. **Turn on the website.** In this repo: Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.

2. **Register the app with Microsoft** (free, one time). This is what lets the robot read Outlook mail after you approve it.
   1. Go to <https://entra.microsoft.com> and sign in with your Outlook account.
   2. Applications → App registrations → **New registration**.
   3. Name: `Job Tracker`. Supported account types: **Personal Microsoft accounts only**. Leave Redirect URI empty. Register.
   4. Copy the **Application (client) ID** shown on the overview page.
   5. Authentication → Advanced settings → **Allow public client flows: Yes** → Save.
   6. API permissions → Add a permission → Microsoft Graph → Delegated → tick **Mail.Read** → Add.

3. **Add two secrets to `job-tracker-data`.** Settings → Secrets and variables → Actions → New repository secret:
   - `MS_CLIENT_ID`: the ID you copied.
   - `TOKEN_KEY`: any long random password (a password manager can make one). It encrypts your sign-ins. You never need to type it again.

4. **Connect each Outlook inbox.** In `job-tracker-data`: Actions → **Add Outlook inbox** → Run workflow. Open the running job and the "Sign in" step. It shows a code: go to <https://microsoft.com/devicelogin>, enter it, and sign in to the inbox you want tracked. Repeat for every extra Outlook inbox.

5. **(Optional) Add Gmail inboxes.** Create a Gmail [app password](https://myaccount.google.com/apppasswords), then add a secret `IMAP_ACCOUNTS` to `job-tracker-data`:
   ```json
   [{ "email": "you@gmail.com", "password": "abcd efgh ijkl mnop" }]
   ```
   Add more objects to the list for more inboxes. Other IMAP providers work too with an extra `"host"` field.

6. **Make a key for the website.** Go to <https://github.com/settings/personal-access-tokens/new>:
   - Repository access: **Only select repositories** → `job-tracker-data`.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Generate, copy it, open the website, and paste it in. Do this once on each phone or computer.

7. **Kick off the first sync.** In `job-tracker-data`: Actions → **Sync job emails** → Run workflow. It looks back 90 days the first time, so recent applications show up right away.

## Good to know

- Updates arrive within about 30 minutes of the email (GitHub sometimes runs a little late).
- Rejections are spotted by wording such as "decided to move forward with other candidates" and matched to the job by company name. A rejection it can't match to a job is listed under "Possible rejections we couldn't match" so you can set the status yourself.
- To change the 30-day "No reply" window, add a repository **variable** (not secret) called `NO_REPLY_DAYS` in `job-tracker-data`.
- If the page says an inbox couldn't be checked, run **Add Outlook inbox** again for that address.
- Everything runs on GitHub's free plan: about 1,500 of the 2,000 free Actions minutes per month.
