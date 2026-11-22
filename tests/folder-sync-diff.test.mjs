// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import { computeFolderSyncDiff, normalizeSyncRelPath } from '../src/lib/vault/folder-sync-diff.ts';

function fakeFile(name, size) {
  return { name, size };
}

// 1. Adicionados, modificados (overwrite por tamanho), removidos e inalterados
{
  const res = computeFolderSyncDiff({
    localRootName: 'Portfolio',
    targetFolderName: 'Portfolio',
    localFiles: [
      { file: fakeFile('nova.jpg', 500), relPath: 'nova.jpg', size: 500 },
      { file: fakeFile('editada.jpg', 900), relPath: 'editada.jpg', size: 900 },
      { file: fakeFile('igual.jpg', 300), relPath: 'igual.jpg', size: 300 },
      { file: fakeFile('sub.jpg', 200), relPath: 'Ensaio/sub.jpg', size: 200 },
    ],
    remoteManifest: {
      folder: 'Portfolio',
      files: [
        { relPath: 'editada.jpg', sizeBytes: 850 },
        { relPath: 'igual.jpg', sizeBytes: 300 },
        { relPath: 'antiga.jpg', sizeBytes: 400 },
      ],
    },
  });

  assert.equal(res.added.length, 2);
  assert.equal(res.modified.length, 1);
  assert.equal(res.removed.length, 1);
  assert.equal(res.unchangedCount, 1);
  assert.deepEqual(res.newFolders, ['Ensaio']);
  assert.equal(res.rootNameMismatch, false);
  assert.equal(res.highRemovalWarning, false);
  assert.equal(res.peakAddedBytes, 500 + 200 + 900);
}

// 2. Trava >70% quando nome da raiz é diferente
{
  const res = computeFolderSyncDiff({
    localRootName: 'OutraPasta',
    targetFolderName: 'Portfolio',
    localFiles: [{ file: fakeFile('x.jpg', 100), relPath: 'x.jpg', size: 100 }],
    remoteManifest: {
      folder: 'Portfolio',
      files: [
        { relPath: 'a.jpg', sizeBytes: 100 },
        { relPath: 'b.jpg', sizeBytes: 100 },
        { relPath: 'c.jpg', sizeBytes: 100 },
        { relPath: 'd.jpg', sizeBytes: 100 },
      ],
    },
  });

  assert.equal(res.rootNameMismatch, true);
  assert.equal(res.highRemovalWarning, true);
  assert.equal(res.removed.length, 4);
}

// 3. Subpasta trancada por PIN nunca é marcada como "Saem"
{
  const res = computeFolderSyncDiff({
    localRootName: 'Portfolio',
    targetFolderName: 'Portfolio',
    localFiles: [{ file: fakeFile('pub.jpg', 100), relPath: 'pub.jpg', size: 100 }],
    remoteManifest: {
      folder: 'Portfolio',
      lockedSubfolders: ['Privado'],
      files: [
        { relPath: 'pub.jpg', sizeBytes: 100 },
        { relPath: 'Privado/segredo.jpg', sizeBytes: 999 },
      ],
    },
  });

  assert.equal(res.removed.length, 0);
  assert.deepEqual(res.lockedSubfolders, ['Privado']);
}

// 4. Normalização NFC vs NFD (acentos)
{
  const nfc = 'Ação/foto_é.jpg'.normalize('NFC');
  const nfd = 'Ação/foto_é.jpg'.normalize('NFD');
  assert.equal(normalizeSyncRelPath(nfc), normalizeSyncRelPath(nfd));

  const res = computeFolderSyncDiff({
    localRootName: 'Portfolio',
    targetFolderName: 'Portfolio',
    localFiles: [{ file: fakeFile('foto_é.jpg', 100), relPath: nfd, size: 100 }],
    remoteManifest: {
      folder: 'Portfolio',
      files: [{ relPath: nfc, sizeBytes: 100 }],
    },
  });

  assert.equal(res.added.length, 0);
  assert.equal(res.removed.length, 0);
  assert.equal(res.unchangedCount, 1);
}

console.log('✅ folder-sync-diff.test.mjs: 4/4 PASS');
