PHPMailer 7.1.1 — the mail library send.php needs.

These three files are the official release from
https://github.com/PHPMailer/PHPMailer  (LGPL-2.1)

Nothing to install. Upload this whole PHPMailer folder into public_html so you
end up with:

    public_html/send.php
    public_html/PHPMailer/PHPMailer.php
    public_html/PHPMailer/SMTP.php
    public_html/PHPMailer/Exception.php

send.php checks for Composer's vendor/autoload.php first and falls back to this
folder, so it works either way.
