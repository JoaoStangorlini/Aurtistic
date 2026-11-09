// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/webdav-server.js
 * Servidor WebDAV RFC 4918 nativo para o Fire Stick Portal (Sprint 4 / V12.0).
 * Permite montagem direta como unidade de rede no Windows, macOS, Linux, iOS e Android.
 * Suporta OPTIONS, PROPFIND (207 Multi-Status), GET, HEAD, PUT, MKCOL, DELETE, MOVE e COPY.
 */

const fs = require('fs');
const path = require('path');
const url = require('url');

const IGNORED_NAMES = new Set([
  '.trash',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '__MACOSX',
  'trash_manifest.json',
  'catalog.json',
  'shares.json',
  'audit.jsonl',
]);

function toRfc1123Date(date) {
  return new Date(date).toUTCString();
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

class WebdavServer {
  /**
   * @param {string} rootDir - Diretório raiz exposto no WebDAV
   * @param {Object} options
   * @param {Function} options.authenticate - (user, pass) => boolean
   * @param {Object} [options.trashManager] - Instância de TrashManager para exclusão segura
   */
  constructor(rootDir, options = {}) {
    this.rootDir = path.resolve(rootDir);
    this.authenticate = options.authenticate || (() => true);
    this.trashManager = options.trashManager || null;
  }

  resolveSafePath(reqPath) {
    const decoded = decodeURIComponent(reqPath || '').replace(/^\/webdav\/?/i, '');
    const clean = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
    const full = path.join(this.rootDir, clean);
    if (!full.startsWith(this.rootDir)) {
      return this.rootDir;
    }
    return full;
  }

  getHref(fullPath) {
    const rel = path.relative(this.rootDir, fullPath).replace(/\\/g, '/');
    const safeRel = rel ? `/${rel.split('/').map(encodeURIComponent).join('/')}` : '';
    return `/webdav${safeRel}`;
  }

  buildPropstatXml(fullPath, stat) {
    const isDir = stat.isDirectory();
    const href = this.getHref(fullPath) + (isDir ? '/' : '');
    const name = path.basename(fullPath) || 'stangorlini';
    const modified = toRfc1123Date(stat.mtime);

    let propXml = `
      <d:displayname>${escapeXml(name)}</d:displayname>
      <d:getlastmodified>${modified}</d:getlastmodified>
    `;

    if (isDir) {
      propXml += `<d:resourcetype><d:collection/></d:resourcetype>`;
    } else {
      propXml += `
        <d:resourcetype/>
        <d:getcontentlength>${stat.size}</d:getcontentlength>
      `;
    }

    return `
    <d:response>
      <d:href>${escapeXml(href)}</d:href>
      <d:propstat>
        <d:prop>${propXml}</d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`;
  }

  middleware() {
    return async (req, res, next) => {
      if (!req.path.startsWith('/webdav')) {
        return next();
      }

      // 1. Basic Authentication
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Fire Stick Pessoal - Cofre WebDAV"');
        return res.status(401).send('Autenticação WebDAV necessária.');
      }

      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const [user, pass] = credentials.split(':');
      if (!this.authenticate(user, pass)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Fire Stick Pessoal - Cofre WebDAV"');
        return res.status(401).send('Usuário ou senha incorretos.');
      }

      const method = req.method.toUpperCase();
      const targetPath = this.resolveSafePath(req.path);

      try {
        // 2. Método OPTIONS
        if (method === 'OPTIONS') {
          res.setHeader('DAV', '1, 2');
          res.setHeader('MS-Author-Via', 'DAV');
          res.setHeader('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE');
          return res.status(200).end();
        }

        // 3. Método PROPFIND
        if (method === 'PROPFIND') {
          if (!fs.existsSync(targetPath)) {
            return res.status(404).end();
          }

          const depth = req.headers.depth || '1';
          const stat = await fs.promises.stat(targetPath);
          let responses = this.buildPropstatXml(targetPath, stat);

          if (stat.isDirectory() && depth !== '0') {
            const dirents = await fs.promises.readdir(targetPath, { withFileTypes: true }).catch(() => []);
            for (const d of dirents) {
              if (IGNORED_NAMES.has(d.name) || d.name.startsWith('.')) continue;
              const childFull = path.join(targetPath, d.name);
              try {
                const childStat = await fs.promises.stat(childFull);
                responses += this.buildPropstatXml(childFull, childStat);
              } catch {}
            }
          }

          const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:multistatus xmlns:d="DAV:">${responses}
</d:multistatus>`;

          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.status(207).send(xml);
        }

        // 4. Método GET / HEAD
        if (method === 'GET' || method === 'HEAD') {
          if (!fs.existsSync(targetPath)) {
            return res.status(404).send('Não encontrado.');
          }

          const stat = await fs.promises.stat(targetPath);
          if (stat.isDirectory()) {
            return res.status(200).send(`<html><body><h1>Diretório WebDAV: ${escapeXml(req.path)}</h1></body></html>`);
          }

          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Last-Modified', toRfc1123Date(stat.mtime));
          if (method === 'HEAD') return res.status(200).end();

          const stream = fs.createReadStream(targetPath);
          return stream.pipe(res);
        }

        // 5. Método PUT (Upload / Gravação de Arquivo)
        if (method === 'PUT') {
          const parentDir = path.dirname(targetPath);
          if (!fs.existsSync(parentDir)) {
            await fs.promises.mkdir(parentDir, { recursive: true });
          }

          const writeStream = fs.createWriteStream(targetPath);
          req.pipe(writeStream);

          writeStream.on('finish', () => {
            res.status(201).end();
          });
          writeStream.on('error', (err) => {
            res.status(500).send(err.message);
          });
          return;
        }

        // 6. Método MKCOL (Criar Coleção / Pasta)
        if (method === 'MKCOL') {
          if (fs.existsSync(targetPath)) {
            return res.status(405).send('O diretório já existe.');
          }
          await fs.promises.mkdir(targetPath, { recursive: true });
          return res.status(201).end();
        }

        // 7. Método DELETE (Excluir)
        if (method === 'DELETE') {
          if (!fs.existsSync(targetPath)) {
            return res.status(404).end();
          }

          if (this.trashManager) {
            const rel = path.relative(this.rootDir, targetPath);
            await this.trashManager.moveToTrash(targetPath, rel, user || 'webdav');
          } else {
            await fs.promises.rm(targetPath, { recursive: true, force: true });
          }
          return res.status(204).end();
        }

        // 8. Método MOVE / COPY
        if (method === 'MOVE' || method === 'COPY') {
          const destHeader = req.headers.destination;
          if (!destHeader) {
            return res.status(400).send('Cabeçalho Destination obrigatório.');
          }

          const parsedUrl = url.parse(destHeader);
          const destPath = this.resolveSafePath(parsedUrl.pathname);

          const destParent = path.dirname(destPath);
          if (!fs.existsSync(destParent)) {
            await fs.promises.mkdir(destParent, { recursive: true });
          }

          if (method === 'MOVE') {
            await fs.promises.rename(targetPath, destPath);
            return res.status(201).end();
          } else {
            await fs.promises.copyFile(targetPath, destPath);
            return res.status(201).end();
          }
        }

        // Método não suportado
        return res.status(405).end();
      } catch (err) {
        console.error('[WebDAV Error]', err);
        return res.status(500).send(err.message);
      }
    };
  }
}

module.exports = WebdavServer;

