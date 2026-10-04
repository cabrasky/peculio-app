// Legal texts in English (same content as es.ts)
import type { LegalDocs } from './index';

const MAIL = '[gastos@cabrasky.net](mailto:gastos@cabrasky.net)';

const en: LegalDocs = {
  privacidad: {
    title: 'Privacy policy',
    intro: 'Peculio is a free personal project for tracking your spending. This page explains what data it keeps, why, who it is shared with and how you can delete it. In short: your data is only used to make the app work. There is no advertising, analytics or sale of data, and you can delete your account with everything in it at any time.',
    sections: [
      { h: 'Controller', p: [[
        '**Data controller:** Javier Mateos.',
        `**Contact:** ${MAIL}.`,
        '**Where your data lives:** on a server run by the controller in Spain (European Union).',
      ]] },
      { h: 'What data we keep', p: [[
        '**Account data:** name and email. Your password is stored only as a bcrypt hash, never in plain text. Also your profile picture, if you add a URL, and your Google ID, if you sign in with Google.',
        '**Preferences:** language, theme and weekly budget.',
        '**What you record in the app:** expenses (amount, date, description, category, payment method…), receipt photos you upload, incomes, savings goals, subscriptions, projects and your own categories.',
        '**People you share expenses with:** the names you type and what they owe you or have paid back.',
        '**Developer-mode API keys:** only their fingerprint (hash) is stored, not the key.',
        '**Support requests:** what you write to support and the replies you get.',
        '**Technical data:** IP address, date and path of each request, in the server logs, for security and troubleshooting.',
      ], 'We never ask for bank details and we do not connect to your bank.'] },
      { h: 'Why and on what legal basis', p: [[
        '**Providing the service:** creating your account, storing and syncing your data between the web and the app, and sending the password recovery email. This is necessary to perform the [Terms of use](/legal/terminos) you accept when you sign up (art. 6.1.b GDPR).',
        '**Handling support:** answering your requests in the app and by email (art. 6.1.b GDPR).',
        '**Security and operation:** keeping technical logs, detecting errors and preventing abuse, based on our legitimate interest in keeping the service secure (art. 6.1.f GDPR).',
      ], 'We do not use your data for advertising or profiling. There is no analytics or tracking, and your data is never sold or shared.'] },
      { h: 'Who it is shared with', p: [
        'Only in these cases, and only if you use the related feature:',
        [
          '**Google**, if you choose “Continue with Google”: Google identifies you and sends us your name, email and picture. Google LLC may process data in the US under the EU-US Data Privacy Framework, and [Google’s privacy policy](https://policies.google.com/privacy) also applies.',
          '**Cuentas Claras** (cuentas-claras.cabrasky.net), if you send a shared expense there: the title, date, amounts, names of the people in the split and your email are sent. It is a service run by the same controller, and what you send is managed in that app.',
          '**Email:** password recovery emails and support replies are sent from our own mail server (mail.cabrasky.net).',
        ],
        'The website loads no third-party resources: fonts and other files are served from our own server. Data would only be handed to an authority if the law required it.',
      ] },
      { h: 'What the administrator sees', p: [
        'The admin panel shows your account details (name, email, sign-up and last access dates, how you sign in and whether you use the mobile app), **how many** records you have and your support requests, to run the service and help you. It does not show the content of your expenses, incomes or any other records.',
        'The administrator can suspend or delete an account that breaks the [Terms of use](/legal/terminos), and send you a password reset link if you ask.',
      ] },
      { h: 'Other people’s data', p: [
        'If you record other people’s names in shared expenses, do it with their knowledge and keep it to the minimum: a first name or nickname is enough. That data is only used inside your account.',
      ] },
      { h: 'How long we keep it', p: [[
        'Your data is kept for as long as you have an account.',
        'If you **delete your account**, it is erased from the database immediately: the account, expenses, photos, incomes, goals, subscriptions, projects, categories and API keys. Backups are rotated automatically, and deleted data disappears from them within **30 days at most**.',
        'Support requests are kept while you have an account and deleted when you delete it.',
        'Server logs are deleted after **14 days**, and server errors (path, error type and ID, without the content of your data) after 30 days.',
      ]] },
      { h: 'Your rights', p: [
        'You have the right of **access, rectification, erasure, objection, restriction and portability**. You can exercise them:',
        [
          'In the app or on the website: in **Settings** you can edit your data, export your expenses (CSV or Excel) and **delete your account** with all its data. The steps are in [Delete your account](/legal/eliminar-cuenta).',
          `By email to ${MAIL}, for any other request.`,
        ],
        'If you think your data has not been handled properly, you can complain to the Spanish Data Protection Agency ([aepd.es](https://www.aepd.es)).',
      ] },
      { h: 'Security', p: [
        'Connections are encrypted (HTTPS), passwords are stored hashed and access to the server is restricted. No system is infallible, so use a password you don’t use anywhere else.',
      ] },
      { h: 'Mobile app', p: [
        'The Android app keeps a copy of your data on your phone so it works offline, and syncs changes when you are back online. That copy is deleted when you log out or delete your account. The app is installed from Google Play, which keeps it updated, or from this website: in that case it checks here for new versions.',
      ] },
      { h: 'Demo account', p: [
        'The demo on the [home page](/) is a public, read-only sample account: it keeps no data about whoever tries it. The language or theme you pick in it stay only in your browser.',
      ] },
      { h: 'Children', p: ['Peculio is not intended for children under 14.'] },
      { h: 'Changes', p: ['If this policy changes, the new version will be published here with an updated date.'] },
    ],
  },

  cookies: {
    title: 'Cookie policy',
    intro: 'Peculio uses no advertising, analytics or third-party cookies. It only stores in your browser what is essential for the app to work and to remember your preferences. That is why it doesn’t need your consent or a cookie banner.',
    sections: [
      { h: 'What they are', p: [
        'Cookies and local storage are small pieces of data that a website stores in your browser to remember on your next visit.',
      ] },
      { h: 'Cookies we use', p: [
        'All of them are our own and last 1 year:',
        [
          '**mb_locale**: the language you chose.',
          '**mb_theme**: the theme (system, light or dark).',
          '**mb_weekly_goal**: the weekly budget used in the summary.',
        ],
      ] },
      { h: 'Local storage', p: [
        'While you are logged in, the browser’s local storage is also used. These are not cookies and are not sent to the server on their own:',
        [
          '**gastos_token**: your session, so you don’t have to sign in on every visit. It lasts until you log out.',
          '**gastos_user**: your name and preferences, to show them right away. It lasts until you log out.',
          '**gastos_app_data**: a copy of your data so the app loads fast. It is deleted when you log out or delete your account.',
        ],
        'Keys from older versions (gastos_locale, gastos_dark, gastos_goal and gastos_layout_pin) are removed automatically when the website opens.',
      ] },
      { h: 'Why there is no cookie banner', p: [
        'They are all technical or personalisation cookies you choose yourself, and they are needed for the service you ask for. That makes them exempt from consent (art. 22.2 of the Spanish LSSI and the AEPD cookie guide). There are no third-party cookies: no analytics, advertising or social networks. Fonts are served from our own server.',
        'If you sign in with Google, the sign-in page belongs to Google and uses its own cookies under its own policy.',
      ] },
      { h: 'How to delete them', p: [
        'Logging out deletes your session and the copy of your data. To delete your preferences too, clear this site’s cookies and data in your browser settings. The app will keep working, but you will have to sign in and choose your preferences again.',
      ] },
    ],
  },

  'aviso-legal': {
    title: 'Legal notice',
    intro: 'These are the details of the owner of this website, as required by article 10 of the Spanish Information Society Services Act (Ley 34/2002, LSSI).',
    sections: [
      { h: 'Owner', p: [[
        '**Owner:** Javier Mateos.',
        `**Contact:** ${MAIL}.`,
        '**Website:** peculio.cabrasky.net.',
        '**Activity:** a free, non-profit personal project for tracking personal spending. It has no commercial activity and no advertising.',
      ]] },
      { h: 'Use of the site', p: [
        'Using the website and the app means you accept this notice and the [Terms of use](/legal/terminos). How your data is handled is explained in the [Privacy policy](/legal/privacidad), and how cookies are used in the [Cookie policy](/legal/cookies).',
      ] },
      { h: 'Intellectual property', p: [
        'The design, texts, logo and code of Peculio belong to its owner, except open-source components, which keep their own licences. Your data is yours: you can export it and delete it whenever you want.',
      ] },
      { h: 'Liability', p: [
        'Peculio helps you organise your personal finances, but it is not financial, tax or accounting advice. The owner tries to keep it working well and without interruptions, but does not guarantee it is error-free. To the extent permitted by law, the owner is not liable for decisions you make based on the app’s information or for damage caused by technical faults.',
      ] },
      { h: 'Links', p: [
        'Links to third-party sites, such as Google or the AEPD, are provided for convenience; the owner does not control their content.',
      ] },
      { h: 'Governing law', p: [
        'This notice is governed by Spanish law. If you are a consumer, you may go to the courts where you live.',
      ] },
    ],
  },

  terminos: {
    title: 'Terms of use',
    intro: `These terms govern the use of Peculio, both the website and the Android app. You accept them when you create an account. They are short on purpose; if anything is unclear, write to ${MAIL}.`,
    sections: [
      { h: 'The service', p: [
        'Peculio lets you record expenses, incomes, goals, subscriptions and projects, share expenses and see statistics. It is free, has no advertising and is provided “as is”. It may change or improve and, with reasonable notice, could stop being offered.',
      ] },
      { h: 'Your account', p: [[
        'You must be 14 or older.',
        'Use a valid email and a secure password. You are responsible for what is done with your account.',
        'You can leave at any time from **Settings → Delete account**: your account and all your data are deleted.',
      ]] },
      { h: 'Acceptable use', p: [
        'Don’t use Peculio for anything illegal. Don’t try to access other users’ data, attack or overload the service, or abuse the API. If you record other people’s names, do it with their knowledge. The owner may suspend accounts that break these rules.',
      ] },
      { h: 'Your data', p: [
        'The content you enter is yours. The owner only uses it to provide the service, as explained in the [Privacy policy](/legal/privacidad). You can export it as CSV or Excel.',
      ] },
      { h: 'Demo account', p: [
        'The demo is a public, read-only account with sample data that is renewed every day. It cannot be changed or deleted.',
      ] },
      { h: 'No warranty', p: [
        'The app’s information is for guidance only, depends on what you record and is not financial advice. We try to keep everything working, but errors, data loss or downtime can happen, so export your data from time to time. To the extent permitted by law, the owner is not liable for indirect damage arising from using the app.',
      ] },
      { h: 'Changes', p: [
        'If these terms change, the new version will be published here with its date. If you keep using the app afterwards, you are taken to accept the changes. If you don’t agree, you can delete your account.',
      ] },
      { h: 'Governing law', p: [
        'These terms are governed by Spanish law. If you are a consumer, you may go to the courts where you live.',
      ] },
    ],
  },

  'eliminar-cuenta': {
    title: 'Delete your account',
    intro: 'How to delete your **Peculio** account (the Android app and the peculio.cabrasky.net website, by Javier Mateos) with all its data, what is deleted and what is kept for a while. You don’t need the app installed: you can also do it from the website or by email.',
    sections: [
      { h: 'From the Android app', p: [[
        'Open **More → Settings**.',
        'Scroll down to **Delete account** and type your email to confirm.',
        'Tap **Delete my account and my data**.',
      ]] },
      { h: 'From the website', p: [[
        'Log in to [peculio.cabrasky.net](/login) with your account.',
        'Open **Settings**: on a computer, by clicking your name in the side menu; on a phone, from **More**.',
        'Under **Delete account**, click **Delete my account**, type your email and confirm with **Delete my account and my data**.',
      ], 'If you don’t remember your password, you can [reset it](/forgot-password). If you sign in with Google, use “Continue with Google”.'] },
      { h: 'If you can’t log in', p: [
        `Write to ${MAIL} from your account’s email address and ask us to delete it. We will do it within 30 days at most and confirm it by email.`,
      ] },
      { h: 'What is deleted', p: [
        'Immediately, and with no way to recover it, the following is erased from the database:',
        [
          'Your account: name, email, password (its hash), profile picture, Google ID and preferences.',
          'Expenses, receipt photos, incomes, savings goals, subscriptions, projects, categories and the people you share expenses with.',
          'API keys and support requests.',
        ],
        'The copy of your data that the app keeps on your phone is also deleted when you delete your account.',
      ] },
      { h: 'What is kept and for how long', p: [[
        '**Backups:** deleted data disappears from them within **30 days at most**, as they are rotated.',
        '**Server logs** (IP address, date and path of each request): deleted after **14 days**.',
        '**Server errors:** deleted after **30 days**. They only keep the path, the error type and an ID, with none of your data.',
        '**Cuentas Claras:** splits you have sent to Cuentas Claras are managed in that app and are not deleted with your Peculio account.',
      ], 'Nothing else is kept, for any purpose.'] },
      { h: 'Delete data without deleting your account', p: [
        'From the app or the website you can delete at any time any expense, receipt photo, income, goal, subscription, project or category, and revoke your API keys. They are erased immediately, and from backups within 30 days at most.',
        `To delete any other data, such as your support requests, write to ${MAIL}.`,
      ] },
    ],
  },
};

export default en;
