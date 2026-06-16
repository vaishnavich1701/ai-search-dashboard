import { adminUnauthorizedResponse, isAdminRequest } from '@/lib/adminAuth';
import { getAnalyticsLogs } from '@/lib/analyticsQueries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (req: Request) => {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  const url = new URL(req.url);
  const filters = {
    start: url.searchParams.get('start'),
    end: url.searchParams.get('end'),
    model: url.searchParams.get('model'),
    provider: url.searchParams.get('provider'),
    status: url.searchParams.get('status'),
    userId: url.searchParams.get('userId'),
    organizationId: url.searchParams.get('organizationId'),
  };
  return Response.json(
    getAnalyticsLogs(
      filters,
      Number(url.searchParams.get('page') || 1),
      Number(url.searchParams.get('pageSize') || 25),
      url.searchParams.get('sort') === 'slowest',
    ),
  );
};
