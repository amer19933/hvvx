import { connect } from 'cloudflare:sockets';

const userID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';
const proxyIP = 'cdn.xn--b6gac.eu.org';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const id = env.UUID || userID;
    const upgradeHeader = request.headers.get('Upgrade');
    const url = new URL(request.url);

    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      if (url.pathname.includes(id)) {
        return new Response(`vless://${id}@${url.hostname}:443?encryption=none&security=tls&sni=${url.hostname}&type=ws&host=${url.hostname}&path=%2Fapi#Pages-VLESS`, {
          status: 200,
          headers: { 'content-type': 'text/plain;charset=utf-8' },
        });
      }
      return new Response('API Gateway Active', { status: 200 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();

    handleVLESS(server, id, env.PROXYIP || proxyIP);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  } catch (err) {
    return new Response(err.toString(), { status: 500 });
  }
}

async function handleVLESS(webSocket, userID, defaultProxyIP) {
  let remoteSocket = null;
  webSocket.addEventListener('message', async (event) => {
    try {
      if (remoteSocket) {
        const writer = remoteSocket.writable.getWriter();
        await writer.write(event.data);
        writer.releaseLock();
        return;
      }

      const buffer = event.data;
      if (buffer.byteLength < 18) return;

      const slice = new Uint8Array(buffer.slice(1, 17));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join('');
      const receivedUUID = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

      if (receivedUUID !== userID) {
        webSocket.close();
        return;
      }

      const view = new DataView(buffer);
      const optLength = view.getUint8(17);
      const cmd = view.getUint8(18 + optLength);
      if (cmd !== 1) return;

      let offset = 19 + optLength;
      const port = view.getUint16(offset);
      offset += 2;
      const addressType = view.getUint8(offset++);
      let address = '';

      if (addressType === 1) {
        address = new Uint8Array(buffer.slice(offset, offset + 4)).join('.');
        offset += 4;
      } else if (addressType === 2) {
        const domainLen = view.getUint8(offset++);
        address = new TextDecoder().decode(buffer.slice(offset, offset + domainLen));
        offset += domainLen;
      } else if (addressType === 3) {
        const ipv6 = [];
        for (let i = 0; i < 8; i++) {
          ipv6.push(view.getUint16(offset).toString(16));
          offset += 2;
        }
        address = ipv6.join(':');
      }

      const rawData = buffer.slice(offset);

      remoteSocket = connect({
        hostname: defaultProxyIP || address,
        port: port,
      });

      const writer = remoteSocket.writable.getWriter();
      await writer.write(rawData);
      writer.releaseLock();

      remoteSocket.readable.pipeTo(new WritableStream({
        write(chunk) {
          webSocket.send(chunk);
        },
        close() {
          webSocket.close();
        },
        abort() {
          webSocket.close();
        }
      })).catch(() => webSocket.close());

    } catch (e) {
      webSocket.close();
    }
  });

  webSocket.addEventListener('close', () => {
    if (remoteSocket) remoteSocket.close();
  });
}
