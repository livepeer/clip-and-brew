import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'https://esm.sh/@react-email/components@0.0.22'
import * as React from 'https://esm.sh/react@18.3.1'

interface OtpEmailProps {
  token: string
  supabase_url: string
  email_action_type: string
  redirect_to: string
  token_hash: string
}

export const OtpEmail = ({
  token,
  supabase_url,
  email_action_type,
  redirect_to,
  token_hash,
}: OtpEmailProps) => (
  <Html>
    <Head />
    <Preview>Click to sign in to Brewdream</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Sign in to Brewdream</Heading>
        <Text style={text}>
          Click the button below to sign in to your account:
        </Text>
        <Link
          href={`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
          target="_blank"
          style={button}
        >
          Sign in to Brewdream
        </Link>
        <Text style={{ ...text, marginTop: '24px', color: '#ababab', fontSize: '12px' }}>
          This link will expire in 1 hour. If you didn&apos;t request this email, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default OtpEmail

const main = {
  backgroundColor: '#0a0a0a',
}

const container = {
  paddingLeft: '12px',
  paddingRight: '12px',
  margin: '0 auto',
  paddingTop: '40px',
  paddingBottom: '40px',
}

const h1 = {
  color: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
}

const text = {
  color: '#d1d5db',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '14px',
  margin: '24px 0',
}

const button = {
  display: 'inline-block',
  padding: '16px 32px',
  backgroundColor: '#8B5CF6',
  color: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  borderRadius: '8px',
  marginTop: '16px',
  marginBottom: '16px',
  textAlign: 'center' as const,
}
