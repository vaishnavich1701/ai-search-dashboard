const getFeedbackToken = () =>
  process.env.ANALYTICS_FEEDBACK_TOKEN ||
  process.env.ADMIN_ANALYTICS_TOKEN ||
  process.env.ADMIN_TOKEN;

export const isFeedbackAuthorized = (req: Request) => {
  const configuredToken = getFeedbackToken();
  if (!configuredToken) return false;

  const headerToken = req.headers.get('x-feedback-token');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : undefined;

  return headerToken === configuredToken || bearerToken === configuredToken;
};

export const feedbackUnauthorizedResponse = () =>
  Response.json(
    {
      message:
        'Feedback updates require authenticated ownership context. Configure ANALYTICS_FEEDBACK_TOKEN or integrate server-side user ownership before enabling public feedback writes.',
    },
    { status: 403 },
  );
