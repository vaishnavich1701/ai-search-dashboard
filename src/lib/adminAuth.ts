export const isAdminAnalyticsEnabled = () =>
  Boolean(process.env.ADMIN_ANALYTICS_TOKEN || process.env.ADMIN_TOKEN);

export const isAdminRequest = (req: Request) => {
  const configuredToken =
    process.env.ADMIN_ANALYTICS_TOKEN || process.env.ADMIN_TOKEN;
  if (!configuredToken) return false;

  const headerToken = req.headers.get('x-admin-token');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : undefined;

  return headerToken === configuredToken || bearerToken === configuredToken;
};

export const adminUnauthorizedResponse = () =>
  Response.json(
    {
      message: isAdminAnalyticsEnabled()
        ? 'Admin analytics access requires a valid admin token.'
        : 'Admin analytics is disabled until ADMIN_ANALYTICS_TOKEN is configured.',
    },
    { status: 403 },
  );
