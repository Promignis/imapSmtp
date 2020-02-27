import nodemailer from 'nodemailer'

export const smtpTransport = nodemailer.createTransport({
    host: "0.0.0.0",
    pool: true,
    port: 587,
    secure: false, // TODO: upgrade later with STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});
