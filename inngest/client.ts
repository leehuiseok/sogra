import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'sogra',
  signingKey: process.env.INNGEST_SIGNING_KEY,
})
