export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, message: 'Functions are working!' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
