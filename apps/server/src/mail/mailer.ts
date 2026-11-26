import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { UserRuntimeConfig } from '../config/user-runtime-config.js';

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
}

function createTransport(config: UserRuntimeConfig) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    throw new Error('SMTP is not configured. Open Settings -> Integrations to configure Gmail or SMTP first.');
  }
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
  });
}

export async function verifySmtpConnection(config: UserRuntimeConfig): Promise<{ ok: boolean; error: string | null }> {
  try {
    const transporter = createTransport(config);
    await transporter.verify();
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SMTP verification failed.' };
  }
}

export async function sendApprovedEmail(options: {
  config: UserRuntimeConfig;
  senderDisplayName: string;
  to: string;
  subject: string;
  text: string;
  attachment?: {
    storageRoot: string;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
  } | null;
}): Promise<{ messageId: string }> {
  const recipient = options.to.trim();
  if (!isValidEmailAddress(recipient)) {
    throw new Error('Enter a valid recipient email address before sending.');
  }

  const transporter = createTransport(options.config);
  const fromName = (options.config.smtpFromName || options.senderDisplayName || 'CareerScout').replace(/["\r\n]/gu, '');
  const fromAddress = options.config.smtpUser!;

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (options.attachment) {
    const root = resolve(options.attachment.storageRoot);
    const target = resolve(root, options.attachment.storageKey);
    const rel = relative(root, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Invalid resume attachment path.');
    }
    const content = await readFile(target);
    attachments.push({
      filename: options.attachment.originalFilename,
      content,
      contentType: options.attachment.mimeType,
    });
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: recipient,
    subject: options.subject.trim() || 'Application Inquiry',
    text: options.text,
    attachments,
  });

  return { messageId: info.messageId };
}
