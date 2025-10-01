import { vi } from 'vitest'
import type { SAMLProfile, SAMLValidationResult } from '@/lib/types/saml'

/**
 * SAML Mock Factory
 * Provides standardized SAML mocking for consistent test patterns
 *
 * This follows the same pattern as auth-mocks.ts for consistency
 */

export interface SAMLMockSuite {
  responses: {
    validResponse: string;
    expiredResponse: string;
    invalidSignatureResponse: string;
    replayAttackResponse: string;
    wrongIssuerResponse: string;
    unauthorizedDomainResponse: string;
  };
  profiles: {
    validProfile: SAMLProfile;
    invalidEmailProfile: SAMLProfile;
    unauthorizedDomainProfile: SAMLProfile;
    ssoOnlyUserProfile: SAMLProfile;
  };
  certificates: {
    validIdPCert: string;
    expiredIdPCert: string;
    invalidIdPCert: string;
  };
  metadata: {
    validMetadataXML: string;
    invalidMetadataXML: string;
    missingCertMetadataXML: string;
  };
  validationResults: {
    success: SAMLValidationResult;
    signatureFailed: SAMLValidationResult;
    issuerFailed: SAMLValidationResult;
    replayDetected: SAMLValidationResult;
  };
}

/**
 * Create a valid base64-encoded SAML response
 * This is a simplified mock - in reality SAML responses are XML and signed
 */
export function createValidSAMLResponse(
  email: string,
  options: {
    issuer?: string;
    assertionId?: string;
    notBefore?: Date;
    notOnOrAfter?: Date;
    displayName?: string;
    givenName?: string;
    surname?: string;
  } = {}
): string {
  const now = new Date()
  const issuer = options.issuer || 'https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/'
  const assertionId = options.assertionId || `_${Math.random().toString(36).substring(2, 15)}`
  const notBefore = options.notBefore || new Date(now.getTime() - 5 * 60 * 1000)
  const notOnOrAfter = options.notOnOrAfter || new Date(now.getTime() + 5 * 60 * 1000)

  // Simplified SAML Response XML (real SAML responses are much more complex)
  const samlXml = `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                ID="_${Math.random().toString(36).substring(2, 15)}"
                Version="2.0"
                IssueInstant="${now.toISOString()}">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                  ID="${assertionId}"
                  Version="2.0"
                  IssueInstant="${now.toISOString()}">
    <saml:Issuer>${issuer}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore.toISOString()}" NotOnOrAfter="${notOnOrAfter.toISOString()}">
      <saml:AudienceRestriction>
        <saml:Audience>http://localhost:4001/saml/metadata</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress">
        <saml:AttributeValue>${email}</saml:AttributeValue>
      </saml:Attribute>
      ${options.displayName ? `<saml:Attribute Name="http://schemas.microsoft.com/identity/claims/displayname">
        <saml:AttributeValue>${options.displayName}</saml:AttributeValue>
      </saml:Attribute>` : ''}
      ${options.givenName ? `<saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname">
        <saml:AttributeValue>${options.givenName}</saml:AttributeValue>
      </saml:Attribute>` : ''}
      ${options.surname ? `<saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname">
        <saml:AttributeValue>${options.surname}</saml:AttributeValue>
      </saml:Attribute>` : ''}
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`

  return Buffer.from(samlXml).toString('base64')
}

/**
 * Create expired SAML response (timestamp validation failure)
 */
export function createExpiredSAMLResponse(email: string): string {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  return createValidSAMLResponse(email, {
    notBefore: oneHourAgo,
    notOnOrAfter: thirtyMinutesAgo
  })
}

/**
 * Create SAML response from wrong tenant (issuer validation failure)
 */
export function createWrongTenantSAMLResponse(email: string): string {
  return createValidSAMLResponse(email, {
    issuer: 'https://sts.windows.net/wrong-tenant-id/'
  })
}

/**
 * Create SAML response with unauthorized email domain
 */
export function createUnauthorizedDomainSAMLResponse(): string {
  return createValidSAMLResponse('hacker@attacker.com')
}

/**
 * Create mock SAML profiles
 */
export function createMockSAMLProfiles() {
  const validProfile: SAMLProfile = {
    issuer: 'https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/',
    nameID: 'test@bendcare.com',
    email: 'test@bendcare.com',
    sessionIndex: 'session-123',
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    assertionID: '_assertion-123',
    displayName: 'Test User',
    givenName: 'Test',
    surname: 'User',
    notBefore: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    notOnOrAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    audience: 'http://localhost:4001/saml/metadata',
    attributes: {
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'test@bendcare.com',
      'http://schemas.microsoft.com/identity/claims/displayname': 'Test User'
    }
  }

  const invalidEmailProfile: SAMLProfile = {
    ...validProfile,
    email: 'not-an-email',
    nameID: 'not-an-email'
  }

  const unauthorizedDomainProfile: SAMLProfile = {
    ...validProfile,
    email: 'hacker@attacker.com',
    nameID: 'hacker@attacker.com'
  }

  const ssoOnlyUserProfile: SAMLProfile = {
    ...validProfile,
    email: 'sso.only@bendcare.com',
    nameID: 'sso.only@bendcare.com'
  }

  return {
    validProfile,
    invalidEmailProfile,
    unauthorizedDomainProfile,
    ssoOnlyUserProfile
  }
}

/**
 * Create mock certificates
 */
export function createMockCertificates() {
  // Valid test certificate (PEM format)
  const validIdPCert = `-----BEGIN CERTIFICATE-----
MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJ
RTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJlclRydXN0MSIwIAYD
VQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBSb290MB4XDTAwMDUxMjE4NDYwMFoX
DTI1MDUxMjIzNTkwMFowWjELMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9y
ZTETMBEGA1UECxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVy
VHJ1c3QgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKMEuyKr
mD1X6CZymrV51Cni4eiVgLGw41uOKymaZN+hXe2wCQVt2yguzmKiYv60iNoS6zjr
IZ3AQSsBUnuId9Mcj8e6uYi1agnnc+gRQKfRzMpijS3ljwumUNKoUMMo6vWrJYeK
mpYcqWe4PwzV9/lSEy/CG9VwcPCPwBLKBsua4dnKM3p31vjsufFoREJIE9LAwqSu
XmD+tqYF/LTdB1kC1FkYmGP1pWPgkAx9XbIGevOF6uvUA65ehD5f/xXtabz5OTZy
dc93Uk3zyZAsuT3lySNTPx8kmCFcB5kpvcY67Oduhjprl3RjM71oGDHweI12v/ye
jl0qhqdNkNwnGjkCAwEAAaNFMEMwHQYDVR0OBBYEFOWdWTCCR1jMrPoIVDaGezq1
BE3wMBIGA1UdEwEB/wQIMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3
DQEBBQUAA4IBAQCFDF2O5G9RaEIFoN27TyclhAO992T9Ldcw46QQF+vaKSm2eT92
9hkTI7gQCvlYpNRhcL0EYWoSihfVCr3FvDB81ukMJY2GQE/szKN+OMY3EU/t3Wgx
jkzSswF07r51XgdIGn9w/xZchMB5hbgF/X++ZRGjD8ACtPhSNzkE1akxehi/oCr0
Epn3o0WC4zxe9Z2etciefC7IpJ5OCBRLbf1wbWsaY71k5h+3zvDyny67G7fyUIhz
ksLi4xaNmjICq44Y3ekQEe5+NauQrz4wlHrQMz2nZQ/1/I6eYs9HRCwBXbsdtTLS
R9I4LtD+gdwyah617jzV/OeBHRnDJELqYzmp
-----END CERTIFICATE-----`

  // Expired certificate (same as valid but we'll mark it as expired in tests)
  const expiredIdPCert = validIdPCert

  // Invalid certificate (malformed)
  const invalidIdPCert = 'INVALID CERTIFICATE DATA'

  return {
    validIdPCert,
    expiredIdPCert,
    invalidIdPCert
  }
}

/**
 * Create mock metadata XML
 */
export function createMockMetadata() {
  const validMetadataXML = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJRTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJlclRydXN0MSIwIAYDVQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBSb290MB4XDTAwMDUxMjE4NDYwMFoXDTI1MDUxMjIzNTkwMFowWjELMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9yZTETMBEGA1UECxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVyVHJ1c3QgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKMEuyKrmD1X6CZymrV51Cni4eiVgLGw41uOKymaZN+hXe2wCQVt2yguzmKiYv60iNoS6zjrIZ3AQSsBUnuId9Mcj8e6uYi1agnnc+gRQKfRzMpijS3ljwumUNKoUMMo6vWrJYeKmpYcqWe4PwzV9/lSEy/CG9VwcPCPwBLKBsua4dnKM3p31vjsufFoREJIE9LAwqSuXmD+tqYF/LTdB1kC1FkYmGP1pWPgkAx9XbIGevOF6uvUA65ehD5f/xXtabz5OTZydc93Uk3zyZAsuT3lySNTPx8kmCFcB5kpvcY67Oduhjprl3RjM71oGDHweI12v/yejl0qhqdNkNwnGjkCAwEAAaNFMEMwHQYDVR0OBBYEFOWdWTCCR1jMrPoIVDaGezq1BE3wMBIGA1UdEwEB/wQIMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3DQEBBQUAA4IBAQCFDF2O5G9RaEIFoN27TyclhAO992T9Ldcw46QQF+vaKSm2eT929hkTI7gQCvlYpNRhcL0EYWoSihfVCr3FvDB81ukMJY2GQE/szKN+OMY3EU/t3WgxjkzSswF07r51XgdIGn9w/xZchMB5hbgF/X++ZRGjD8ACtPhSNzkE1akxehi/oCr0Epn3o0WC4zxe9Z2etciefC7IpJ5OCBRLbf1wbWsaY71k5h+3zvDyny67G7fyUIhzksLi4xaNmjICq44Y3ekQEe5+NauQrz4wlHrQMz2nZQ/1/I6eYs9HRCwBXbsdtTLSR9I4LtD+gdwyah617jzV/OeBHRnDJELqYzmp</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`

  const invalidMetadataXML = '<?xml version="1.0"?><Invalid>XML</Invalid>'

  const missingCertMetadataXML = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <!-- No certificate here -->
  </IDPSSODescriptor>
</EntityDescriptor>`

  return {
    validMetadataXML,
    invalidMetadataXML,
    missingCertMetadataXML
  }
}

/**
 * Create mock validation results
 */
export function createMockValidationResults(): SAMLMockSuite['validationResults'] {
  const baseValidations = {
    signatureValid: true,
    issuerValid: true,
    audienceValid: true,
    timestampValid: true,
    notReplay: true,
    emailDomainValid: true
  }

  const success: SAMLValidationResult = {
    success: true,
    profile: createMockSAMLProfiles().validProfile,
    validations: baseValidations,
    metadata: {
      validatedAt: new Date(),
      issuer: 'https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/',
      assertionID: '_assertion-123',
      sessionIndex: 'session-123'
    }
  }

  const signatureFailed: SAMLValidationResult = {
    success: false,
    error: 'Invalid signature',
    validations: {
      ...baseValidations,
      signatureValid: false
    },
    metadata: {
      validatedAt: new Date(),
      issuer: 'unknown'
    }
  }

  const issuerFailed: SAMLValidationResult = {
    success: false,
    error: 'Invalid issuer',
    validations: {
      ...baseValidations,
      issuerValid: false
    },
    metadata: {
      validatedAt: new Date(),
      issuer: 'https://sts.windows.net/wrong-tenant/'
    }
  }

  const replayDetected: SAMLValidationResult = {
    success: false,
    error: 'Replay attack detected',
    validations: {
      ...baseValidations,
      notReplay: false
    },
    metadata: {
      validatedAt: new Date(),
      issuer: 'https://sts.windows.net/e0268fe2-3176-4ac0-8cef-5f1925dd490e/',
      assertionID: '_assertion-123'
    }
  }

  return {
    success,
    signatureFailed,
    issuerFailed,
    replayDetected
  }
}

/**
 * Create complete SAML mock suite
 */
export function createSAMLMockSuite(): SAMLMockSuite {
  const profiles = createMockSAMLProfiles()
  const certificates = createMockCertificates()
  const metadata = createMockMetadata()
  const validationResults = createMockValidationResults()

  return {
    responses: {
      validResponse: createValidSAMLResponse('test@bendcare.com'),
      expiredResponse: createExpiredSAMLResponse('test@bendcare.com'),
      invalidSignatureResponse: createValidSAMLResponse('test@bendcare.com', {
        assertionId: '_invalid_signature'
      }),
      replayAttackResponse: createValidSAMLResponse('test@bendcare.com', {
        assertionId: '_duplicate_assertion'
      }),
      wrongIssuerResponse: createWrongTenantSAMLResponse('test@bendcare.com'),
      unauthorizedDomainResponse: createUnauthorizedDomainSAMLResponse()
    },
    profiles,
    certificates,
    metadata,
    validationResults
  }
}

/**
 * Mock SAML client for unit tests
 */
export function createSAMLClientMock() {
  return {
    createLoginUrl: vi.fn().mockResolvedValue('https://login.microsoftonline.com/tenant/saml2'),
    validateResponse: vi.fn().mockResolvedValue(createMockValidationResults().success),
    generateMetadata: vi.fn().mockResolvedValue('<EntityDescriptor>...</EntityDescriptor>'),
    getConfig: vi.fn().mockReturnValue({
      entryPoint: 'https://login.microsoftonline.com/tenant/saml2',
      issuer: 'http://localhost:4001/saml/metadata',
      callbackUrl: 'http://localhost:4001/api/auth/saml/callback'
    }),
    reload: vi.fn().mockResolvedValue(undefined)
  }
}

/**
 * Preset configurations for common test scenarios
 */
export const SAMLMockPresets = {
  /** Basic SAML mock for unit tests */
  unit: (): SAMLMockSuite => createSAMLMockSuite(),

  /** Full SAML mock for integration tests */
  integration: (): SAMLMockSuite => createSAMLMockSuite(),

  /** Security testing mock with attack vectors */
  security: (): SAMLMockSuite => createSAMLMockSuite()
} as const
