import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFast, normalizeNormal } from "./normalizer";
import { OIDS } from "./snmp/oids";

test("interpreta estado e visor da Ricoh", () => {
  const result = normalizeFast(
    "RICOH Aficio SP 3510SF",
    "123456",
    [{ oid: `${OIDS.printerStatus}.1`, value: "3" }],
    [{ oid: `${OIDS.display}.1.1`, value: "Replace PrintCartridge" }],
    [],
  );
  assert.equal(result.printerState, "idle");
  assert.equal(result.display, "Replace PrintCartridge");
  assert.equal(result.uptimeTicks, 123456n);
});

test("visor vazio é distinguido de falha na leitura do visor", () => {
  const empty = normalizeFast("RICOH", undefined, [], [{ oid: `${OIDS.display}.1.1`, value: "" }], []);
  const failed = normalizeFast("RICOH", undefined, [], undefined, ["timeout"]);
  assert.equal(empty.display, null);
  assert.equal(failed.display, undefined);
});

test("preserva nível especial de suprimento como valor bruto", () => {
  const result = normalizeNormal(
    "RICOH",
    [{ oid: `${OIDS.markerLifeCount}.1.1`, value: "19029" }],
    [{ oid: `${OIDS.supplyDescription}.1.1`, value: "Black Cartridge" }],
    [{ oid: `${OIDS.supplyUnit}.1.1`, value: "13" }],
    [{ oid: `${OIDS.supplyMaxCapacity}.1.1`, value: "-2" }],
    [{ oid: `${OIDS.supplyLevel}.1.1`, value: "-3" }],
    [],
  );
  assert.deepEqual(result.counters, [{ index: "1.1", valueRaw: "19029" }]);
  assert.deepEqual(result.supplies, [{
    index: "1.1",
    description: "Black Cartridge",
    unitCodeRaw: "13",
    maxCapacityRaw: "-2",
    levelRaw: "-3",
  }]);
});

test("falha parcial de tabela não substitui suprimentos anteriores", () => {
  const result = normalizeNormal("RICOH", [], [], undefined, [], [], ["falha de leitura"]);
  assert.equal(result.supplies, undefined);
});
