import 'server-only'

import { createVerify } from 'node:crypto'

export type SnsEnvelope = {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: '1' | '2'
  Signature: string
  SigningCertURL: string
  Subject?: string
  SubscribeURL?: string
  Token?: string
}

function safeSnsUrl(value: string) {
  const url = new URL(value)
  const awsHost = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i.test(url.hostname)
  if (url.protocol !== 'https:' || !awsHost || url.username || url.password) {
    throw new Error('Invalid SNS URL')
  }
  return url
}

function canonicalMessage(message: SnsEnvelope) {
  const fields = message.Type === 'Notification'
    ? ['Message', 'MessageId', ...(message.Subject ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  return fields.map((key) => `${key}\n${message[key as keyof SnsEnvelope] ?? ''}\n`).join('')
}

export async function verifySnsEnvelope(message: SnsEnvelope) {
  if (!message.MessageId || !message.Signature || !message.SigningCertURL || !message.SignatureVersion) return false
  const certUrl = safeSnsUrl(message.SigningCertURL)
  const certificate = await fetch(certUrl, { cache: 'force-cache', signal: AbortSignal.timeout(10_000) })
  if (!certificate.ok) throw new Error('Unable to retrieve SNS signing certificate')
  const verifier = createVerify(message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1')
  verifier.update(canonicalMessage(message), 'utf8')
  verifier.end()
  return verifier.verify(await certificate.text(), message.Signature, 'base64')
}

export async function confirmSnsSubscription(urlValue: string) {
  const url = safeSnsUrl(urlValue)
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`SNS subscription confirmation returned ${response.status}`)
}
