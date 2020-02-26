import nodemailer from 'nodemailer'

export const smtpTransport = nodemailer.createTransport({
    host: "localhost",
    pool: true,
    port: 587,
    secure: false, // upgrade later with STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});