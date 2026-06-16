export type RequestActor = {
  userId: string | null;
  organizationId: string | null;
};

const TRUSTED_HEADER_FLAG = 'TRUSTED_ANALYTICS_IDENTITY_HEADERS';

/**
 * This app currently has no server-side auth/session principal to read from.
 * Browser clients can forge x-user-id/x-organization-id headers, so they are
 * ignored by default. Deployments that terminate auth in a trusted internal
 * gateway may opt in by setting TRUSTED_ANALYTICS_IDENTITY_HEADERS=true and
 * stripping these headers from public traffic before forwarding to Next.js.
 */
export const getTrustedRequestActor = (req: Request): RequestActor => {
  if (process.env[TRUSTED_HEADER_FLAG] !== 'true') {
    return { userId: null, organizationId: null };
  }

  return {
    userId: req.headers.get('x-user-id'),
    organizationId:
      req.headers.get('x-organization-id') || req.headers.get('x-tenant-id'),
  };
};
