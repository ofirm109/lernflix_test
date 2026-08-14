/**
 * ============================================================================
 *  שליחת חומרי הדרכה במייל  |  אופיר מזרחי
 *  Google Apps Script Web App
 * ============================================================================
 *  מקבל כתובת מייל מהאתר, ושולח אליה מייל מעוצב
 *  עם הקובץ "תבנית אפיון.docx" מצורף.
 *
 *  אין מה להגדיר כאן. האתר מוסר לסקריפט היכן הקובץ נמצא,
 *  ולכן זה עובד עם כל שם מאגר (repository) שתבחר ב-GitHub.
 *
 *  פריסה:  לפריסה (Deploy) -> פריסה חדשה -> אפליקציית אינטרנט
 *          הפעלה בתור:   אני
 *          מי מורשה לגשת: כל אחד
 * ============================================================================
 */

/* ========================= הגדרות ========================= */

// כותרת המייל
const SUBJECT = 'חומרי הדרכה: מערכת שבץ-נא ותבנית אפיון כלי AI';

// השם שיוצג לנמען כשולח
const SENDER_NAME = 'אופיר מזרחי | משרד מבקר המדינה';

// כתובת לתשובות (Reply-To)
const REPLY_TO = 'ofir.mi@mevaker.gov.il';

// שם הקובץ המצורף כפי שיוצג לנמען
const ATTACHMENT_NAME = 'תבנית אפיון.docx';

// שם הקובץ בתוך תיקיית האתר
const ATTACHMENT_FILE = 'assets/tavnit-ipion.docx';

// כתובת גיבוי לקובץ, אם האתר לא מסר כתובת תקינה (אפשר להשאיר ריק)
const FALLBACK_BASE = '';


/* ======================= סוף הגדרות ======================= */


const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// רק כתובות מהדומיינים האלה יתקבלו מהאתר
const ALLOWED_HOST = /^https:\/\/[a-z0-9._-]+\.(github\.io|githubusercontent\.com)\//i;


/** בדיקת תקינות - פתיחת כתובת ה-Web App בדפדפן תציג הודעה. */
function doGet() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;direction:rtl;padding:28px;text-align:right">' +
    '<h2 style="color:#16305a;margin:0 0 8px">&#10004; שירות השליחה פעיל</h2>' +
    '<p style="color:#5a6a7b;margin:0">אפשר להדביק את הכתובת הזו בקובץ index.html.</p></div>'
  );
}


/** נקודת הכניסה מהאתר. */
function doPost(e) {
  try {
    var email = '';
    var base  = '';

    if (e && e.postData && e.postData.contents) {
      try {
        var d = JSON.parse(e.postData.contents);
        email = String(d.email || '').trim();
        base  = String(d.base  || '').trim();
      } catch (parseErr) { /* ננסה מהפרמטרים */ }
    }
    if (!email && e && e.parameter && e.parameter.email) {
      email = String(e.parameter.email).trim();
      base  = String(e.parameter.base || '').trim();
    }

    if (!email) {
      return json({ ok: false, error: 'לא התקבלה כתובת אימייל.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
      return json({ ok: false, error: 'כתובת האימייל אינה תקינה.' });
    }

    // מניעת שליחה כפולה לאותה כתובת בתוך דקה
    var cache = CacheService.getScriptCache();
    var key = 'sent_' + Utilities.base64Encode(email.toLowerCase()).replace(/[^A-Za-z0-9]/g, '');
    if (cache.get(key)) {
      return json({ ok: true, note: 'already sent' });
    }

    var attachment = getAttachment_(base);
    if (!attachment) {
      return json({ ok: false, error: 'הקובץ המצורף אינו זמין כרגע. נסו שוב בעוד רגע.' });
    }

    sendMaterials_(email, attachment);
    cache.put(key, '1', 60);

    return json({ ok: true });

  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'אירעה שגיאה בשליחה. נסו שוב בעוד רגע.' });
  }
}


/** שליחת המייל. */
function sendMaterials_(email, attachment) {
  var options = {
    htmlBody: EMAIL_HTML,
    name: SENDER_NAME,
    attachments: [attachment]
  };
  if (REPLY_TO) {
    options.replyTo = REPLY_TO;
  }
  MailApp.sendEmail(email, SUBJECT, PLAIN_TEXT, options);
}


/**
 * משיכת קובץ תבנית האפיון.
 * האתר מוסר את כתובת הבסיס שלו, כך שאין צורך להגדיר כאן כתובת קבועה.
 * הקובץ נשמר במטמון ל-6 שעות כדי לחסוך בקשות ולעמוד בתקלות רשת זמניות.
 */
function getAttachment_(base) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('attach_b64');

  if (cached) {
    return Utilities.newBlob(Utilities.base64Decode(cached), DOCX_MIME, ATTACHMENT_NAME);
  }

  var candidates = [];
  if (base && ALLOWED_HOST.test(base)) {
    candidates.push(base.replace(/\/+$/, '') + '/' + ATTACHMENT_FILE);
  }
  if (FALLBACK_BASE) {
    candidates.push(FALLBACK_BASE.replace(/\/+$/, '') + '/' + ATTACHMENT_FILE);
  }

  for (var i = 0; i < candidates.length; i++) {
    try {
      var res = UrlFetchApp.fetch(candidates[i], {
        muteHttpExceptions: true,
        followRedirects: true
      });
      if (res.getResponseCode() === 200) {
        var bytes = res.getContent();
        try {
          cache.put('attach_b64', Utilities.base64Encode(bytes), 21600);
        } catch (cacheErr) { /* הקובץ גדול מדי למטמון - לא נורא */ }
        return Utilities.newBlob(bytes, DOCX_MIME, ATTACHMENT_NAME);
      }
      console.error('HTTP ' + res.getResponseCode() + ' : ' + candidates[i]);
    } catch (err) {
      console.error('fetch failed: ' + candidates[i] + ' : ' + err);
    }
  }

  return null;
}


function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/** ניקוי המטמון - הריצו את זה אחרי שמחליפים את קובץ תבנית האפיון באתר. */
function clearAttachmentCache() {
  CacheService.getScriptCache().remove('attach_b64');
  console.log('cache cleared');
}


/* ============ גרסת טקסט (לתוכנות מייל ללא HTML) ============ */
const PLAIN_TEXT =
  'שלום,\n\n' +
  'שמחתי מאוד ללמד אתכם על עולם ה-Vibe Coding ולהדגים כיצד הוא משתלב בעולמות הלמידה שלנו.\n\n' +
  'בהמשך למפגש, אני מצרף שני כלים שימושיים:\n\n' +
  '1. מערכת "שבץ-נא" - המערכת המיועדת לפיתוח, תכנון וניהול של קורסים וכנסים:\n' +
  'https://ofirm109.github.io/lernflix_test/%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%A9%D7%A2%D7%95%D7%AA-%D7%9C%D7%A6%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%A8%D7%97%D7%91.html\n\n' +
  '2. תבנית אפיון (מצורפת למייל): תבנית עבודה מסודרת לאפיון של מערכות וכלים חדשים באמצעות בינה מלאכותית (AI).\n\n' +
  'מקווה שהכלים הללו יסייעו לכם בתהליכי העבודה וייעלו את הפיתוח.\n' +
  'אני זמין לכל שאלה או התייעצות בנושא.\n\n' +
  'בברכה,\n' +
  'אופיר מזרחי, מפתח למידה, אגף למידה ופיתוח ארגוני\n' +
  'משרד מבקר המדינה ונציבת תלונות הציבור\n' +
  'נייד: 054-9404814 | אימייל: ofir.mi@mevaker.gov.il';


/* ================== תבנית המייל המעוצב ================== */

const EMAIL_HTML = `
<!DOCTYPE html>
<html dir="rtl" lang="he" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>חומרי הדרכה: מערכת שבץ-נא ותבנית אפיון כלי AI</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse !important; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:#1d4ed8; }
  @media screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:23px !important; line-height:32px !important; }
    .stack { display:block !important; width:100% !important; }
    .btn a { display:block !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#eef1f6;">

<div style="display:none; font-size:1px; color:#eef1f6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
מצורפים החומרים מהמפגש: מערכת שבץ-נא לתכנון קורסים וכנסים, ותבנית אפיון לפיתוח כלים באמצעות AI.
&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f6;">
<tr>
<td align="center" style="padding:28px 12px 40px 12px;">

  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 2px 10px rgba(16,32,63,0.08);">

    <!-- HEADER -->
    <tr>
      <td style="background-color:#16305a; background-image:linear-gradient(135deg,#16305a 0%,#24518f 100%); padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="px" dir="rtl" style="padding:34px 40px 32px 40px; text-align:right;">
              <div style="font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:12px; line-height:16px; letter-spacing:1.4px; color:#a8c4ef; text-transform:uppercase; font-weight:bold;">
                אגף למידה ופיתוח ארגוני
              </div>
              <div class="h1" style="font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:27px; line-height:36px; color:#ffffff; font-weight:bold; padding-top:10px;">
                חומרי הדרכה מהמפגש
              </div>
              <div style="font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:15px; line-height:24px; color:#c7dcff; padding-top:8px;">
                מערכת שבץ-נא ותבנית אפיון כלי AI
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ACCENT LINE -->
    <tr>
      <td style="height:4px; background-color:#f0b429; line-height:4px; font-size:0;">&nbsp;</td>
    </tr>

    <!-- INTRO -->
    <tr>
      <td class="px" dir="rtl" style="padding:34px 40px 6px 40px; text-align:right; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:16px; line-height:27px; color:#25313f;">
        <p style="margin:0 0 16px 0; font-size:17px; font-weight:bold; color:#16305a;">שלום,</p>
        <p style="margin:0 0 14px 0;">
          שמחתי מאוד ללמד אתכם על עולם ה-Vibe&nbsp;Coding ולהדגים כיצד הוא משתלב בעולמות הלמידה שלנו.
        </p>
        <p style="margin:0 0 4px 0;">
          בהמשך למפגש, אני מצרף שני כלים שימושיים:
        </p>
      </td>
    </tr>

    <!-- CARD 1 -->
    <tr>
      <td class="px" style="padding:20px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background-color:#f6f8fc; border:1px solid #dde5f2; border-radius:10px;">
          <tr>
            <td style="padding:22px 24px 22px 24px; text-align:right; font-family:Arial,'Segoe UI',Helvetica,sans-serif;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                <tr>
                  <td valign="top" style="padding-left:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td align="center" valign="middle" style="width:30px; height:30px; background-color:#24518f; border-radius:15px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#ffffff; line-height:30px;">1</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="font-size:18px; line-height:26px; font-weight:bold; color:#16305a;">
                    מערכת &ldquo;שבץ-נא&rdquo;
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0; font-size:15px; line-height:25px; color:#41505f;">
                המערכת המיועדת לפיתוח, תכנון וניהול של קורסים וכנסים.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin-top:16px;">
                <tr>
                  <td align="center" style="background-color:#24518f; border-radius:7px;">
                    <a href="https://ofirm109.github.io/lernflix_test/%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%A9%D7%A2%D7%95%D7%AA-%D7%9C%D7%A6%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%A8%D7%97%D7%91.html"
                       style="display:inline-block; padding:12px 26px; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:7px;">
                      כניסה למערכת שבץ-נא &#8592;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CARD 2 -->
    <tr>
      <td class="px" style="padding:16px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background-color:#f6f8fc; border:1px solid #dde5f2; border-radius:10px;">
          <tr>
            <td style="padding:22px 24px 22px 24px; text-align:right; font-family:Arial,'Segoe UI',Helvetica,sans-serif;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                <tr>
                  <td valign="top" style="padding-left:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td align="center" valign="middle" style="width:30px; height:30px; background-color:#24518f; border-radius:15px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#ffffff; line-height:30px;">2</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="font-size:18px; line-height:26px; font-weight:bold; color:#16305a;">
                    תבנית אפיון
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0; font-size:15px; line-height:25px; color:#41505f;">
                תבנית עבודה מסודרת לאפיון של מערכות וכלים חדשים באמצעות בינה מלאכותית (AI).
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px; background-color:#fff8e6; border:1px solid #f5dca0; border-radius:6px;">
                <tr>
                  <td style="padding:10px 14px; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:14px; line-height:22px; color:#7a5a12;">
                    &#128206;&nbsp; הקובץ <strong>&ldquo;תבנית אפיון.docx&rdquo;</strong> מצורף למייל זה.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- OUTRO -->
    <tr>
      <td class="px" dir="rtl" style="padding:26px 40px 4px 40px; text-align:right; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:16px; line-height:27px; color:#25313f;">
        <p style="margin:0 0 12px 0;">מקווה שהכלים הללו יסייעו לכם בתהליכי העבודה וייעלו את הפיתוח.</p>
        <p style="margin:0;">אני זמין לכל שאלה או התייעצות בנושא.</p>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr>
      <td class="px" style="padding:26px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="height:1px; background-color:#e3e9f2; line-height:1px; font-size:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>

    <!-- SIGNATURE -->
    <tr>
      <td class="px" dir="rtl" style="padding:22px 40px 34px 40px; text-align:right; font-family:Arial,'Segoe UI',Helvetica,sans-serif;">
        <p style="margin:0 0 12px 0; font-size:16px; line-height:26px; color:#25313f;">בברכה,</p>
        <p style="margin:0; font-size:17px; line-height:26px; font-weight:bold; color:#16305a;">אופיר מזרחי</p>
        <p style="margin:2px 0 0 0; font-size:14px; line-height:22px; color:#5a6a7b;">מפתח למידה, אגף למידה ופיתוח ארגוני</p>
        <p style="margin:0; font-size:14px; line-height:22px; color:#5a6a7b;">משרד מבקר המדינה ונציבת תלונות הציבור</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="margin-top:14px;">
          <tr>
            <td style="font-size:14px; line-height:24px; font-family:Arial,'Segoe UI',Helvetica,sans-serif; color:#41505f;">
              <span style="color:#8593a3;">נייד:</span>&nbsp;<a href="tel:+972549404814" style="color:#24518f; text-decoration:none;">054-9404814</a>
              <span style="color:#c8d2e0;">&nbsp;|&nbsp;</span>
              <span style="color:#8593a3;">אימייל:</span>&nbsp;<a href="mailto:ofir.mi@mevaker.gov.il" style="color:#24518f; text-decoration:none;">ofir.mi@mevaker.gov.il</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:14px; line-height:24px; font-family:Arial,'Segoe UI',Helvetica,sans-serif; color:#41505f; padding-top:2px;">
              <a href="https://www.linkedin.com/in/ofir-mizrahi-69550817b/" style="color:#24518f; text-decoration:none;">לינקדאין</a>
              <span style="color:#c8d2e0;">&nbsp;|&nbsp;</span>
              <a href="https://www.facebook.com/wpyrmzrhy.902125" style="color:#24518f; text-decoration:none;">פייסבוק</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td dir="rtl" style="background-color:#f3f5f9; border-top:1px solid #e3e9f2; padding:18px 40px; text-align:center; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:12px; line-height:20px; color:#8593a3;">
        מייל זה נשלח אוטומטית בעקבות בקשתך לקבלת חומרי ההדרכה.
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>

`;
