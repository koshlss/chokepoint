/* Код запрошення: JSON → deflate → base64url. SDP довгий, стиснення
   робить його придатним для вставки в чат. */
async function packCode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out = bytes;
  if (typeof CompressionStream === 'function') {
    const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    out = new Uint8Array(await new Response(st).arrayBuffer());
  }
  let s = '';
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return (typeof CompressionStream === 'function' ? 'Z' : 'P') +
         btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackCode(code) {
  const tag = code[0];
  let b64 = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (tag === 'Z') {
    const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(await new Response(st).arrayBuffer()));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export { packCode, unpackCode };
