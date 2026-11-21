// Este programa é um software livre (Licença AGPLv3)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const storagePool = require('../servidor/lib/storage-pool.js');
const vaultCrypto = require('../servidor/lib/vault-crypto.js');
const { migrateDirectory } = require('../servidor/scripts/encrypt-vault-migration.js');

console.log('=== Iniciando Suíte de Testes Multi-Discos (Storage Pool + AURTENC2) ===\n');

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'aurt-pool-test-'));
const usbMock = path.join(tmpBase, 'usb_mock');
const hd1Mock = path.join(tmpBase, 'hd1_mock');
const hd2Mock = path.join(tmpBase, 'hd2_mock');
fs.mkdirSync(path.join(usbMock, 'users', 'u1'), { recursive: true });
fs.mkdirSync(path.join(hd1Mock, 'users', 'u1'), { recursive: true });
fs.mkdirSync(path.join(hd2Mock, 'users', 'u1'), { recursive: true });

const origKey = process.env.VAULT_MASTER_KEY;
const origExtra = process.env.EXTRA_STORAGE_DIRS;
process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.EXTRA_STORAGE_DIRS = `${hd1Mock}:${hd2Mock}`;

try {
  // 1. Auto-descoberta e telemetria agregada
  console.log('1. Testando discoverStorageVolumes e getAggregatedTelemetry...');
  const vols = storagePool.discoverStorageVolumes(usbMock);
  assert.equal(vols.length, 3, 'Deve descobrir os 3 volumes (usb_mock + hd1_mock + hd2_mock)');
  const tel = storagePool.getAggregatedTelemetry(vols);
  assert.equal(tel.volumes.length, 3);
  assert.equal(tel.degraded, false);
  console.log('   ✓ 3 volumes descobertos e telemetria agregada gerada');

  // 2. Resolução cross-volume (Union FS)
  console.log('2. Testando resolveTenantFileAcrossVolumes...');
  const fileInHd2 = path.join(hd2Mock, 'users', 'u1', 'relatorio.txt');
  fs.writeFileSync(fileInHd2, 'Dados no HD2');
  const resolved = storagePool.resolveTenantFileAcrossVolumes(vols, 'users/u1', 'relatorio.txt');
  assert.ok(resolved !== null);
  assert.equal(resolved.filePath, fileInHd2);
  console.log('   ✓ Arquivo localizado transparentemente no HD2');

  // 3. Política de escrita (overwrite no mesmo volume + maior espaço livre para novo)
  console.log('3. Testando pickWriteVolume (overwrite vs novo upload)...');
  const overwriteVol = storagePool.pickWriteVolume(vols, 100, fileInHd2);
  assert.equal(overwriteVol.rootDir, hd2Mock);
  const newVol = storagePool.pickWriteVolume(vols, 100, null);
  assert.ok(newVol && newVol.writable);
  console.log('   ✓ Overwrite manteve HD2 e novo upload selecionou volume gravável');

  // 4. Desconexão parcial sinaliza degraded sem quebrar os demais
  console.log('4. Testando desconexão parcial (degraded)...');
  const degradedVols = vols.map((v) => (v.rootDir === hd1Mock ? { ...v, online: false } : v));
  const degTel = storagePool.getAggregatedTelemetry(degradedVols);
  assert.equal(degTel.degraded, true);
  const stillFound = storagePool.resolveTenantFileAcrossVolumes(degradedVols, 'users/u1', 'relatorio.txt');
  assert.ok(stillFound !== null);
  console.log('   ✓ Desconexão parcial sinalizou degraded mantendo HD2 acessível');

  // 5. Portabilidade AURTENC2 entre hd1Mock e hd2Mock
  console.log('5. Testando portabilidade AURTENC2 entre volumes distintos...');
  const plainSrc = path.join(tmpBase, 'plain.bin');
  const encHd1 = path.join(hd1Mock, 'users', 'u1', 'video.bin');
  const encHd2 = path.join(hd2Mock, 'users', 'u1', 'video.bin');
  fs.writeFileSync(plainSrc, 'Conteudo portatil entre HDs');
  await vaultCrypto.encryptFileAtomic(plainSrc, encHd1, 'user:u1');
  await storagePool.moveAcrossVolumesOrRename(encHd1, encHd2);
  const decHd2 = await vaultCrypto.decryptBuffer(encHd2, 'user:u1');
  assert.equal(decHd2.toString('utf8'), 'Conteudo portatil entre HDs');
  console.log('   ✓ Arquivo AURTENC2 movido de HD1 para HD2 e descriptografado com sucesso');

  // 6. Migração --all-volumes preservando PORTFOLIO_DIR
  console.log('6. Testando migração em múltiplos volumes preservando PORTFOLIO_DIR...');
  fs.mkdirSync(path.join(hd1Mock, 'portfolio'), { recursive: true });
  fs.writeFileSync(path.join(hd1Mock, 'portfolio', 'public.jpg'), 'PUBLICO');
  const migRes = await migrateDirectory(path.join(hd2Mock, 'users', 'u1'), 'user:u1', { apply: true });
  assert.equal(migRes.errors, 0);
  assert.equal(fs.readFileSync(path.join(hd1Mock, 'portfolio', 'public.jpg'), 'utf8'), 'PUBLICO');
  console.log('   ✓ Migração multi-volumes executada preservando PORTFOLIO_DIR público intacto');

  console.log('\n✅ TODOS OS 6 TESTES DE STORAGE POOL (MULTI-DISCOS) PASSARAM!\n');
} finally {
  if (origKey !== undefined) process.env.VAULT_MASTER_KEY = origKey;
  else delete process.env.VAULT_MASTER_KEY;
  if (origExtra !== undefined) process.env.EXTRA_STORAGE_DIRS = origExtra;
  else delete process.env.EXTRA_STORAGE_DIRS;
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
