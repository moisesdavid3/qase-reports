export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace('/api/qase', '');
  const target = `https://api.qase.io/v1${path}${url.search}`;

  const req = new Request(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body
      : undefined,
  });

  return fetch(req);
}
