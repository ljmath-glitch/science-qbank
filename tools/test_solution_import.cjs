const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const importer = source.slice(source.indexOf('async function doImportSol(){'), source.indexOf('// 22欄舊格式相容'));
const converter = source.slice(source.indexOf('function toRow(it){'), source.indexOf('function fromRow('));

async function run(failAt = -1, missing = false, approve = true) {
  const writes = [], alerts = [];
  let closed = false, reloads = 0;
  const ctx = {
    requireCloud: () => true,
    solCsvArea: {value: ''},
    parseCSV: () => [['考試名稱', '題號', '詳解'], ['測試', '第０１題', '新詳解'], ['測試', '2', '取代詳解']],
    DB: [{id: 'q1', exam: '測試', no: '1', sol: '', updatedAt: 'internal', q: '原題目'},
      {id: 'q2', exam: '測試', no: '2', sol: '舊詳解', ans: 'A'}],
    _findBatchExam: () => '測試', normalizeSol: x => x, fixControlCharEatenLatex: x => x,
    confirm: () => approve, alert: x => alerts.push(x),
    solImportDlg: {close: () => {closed = true;}},
    load: async () => {reloads++;}, buildFilters() {}, render() {},
    sb: {from(table) {
      assert.equal(table, 'questions');
      return {update: payload => ({eq: (key, id) => ({select: async columns => {
        assert.equal(key, 'id'); assert.equal(columns, 'id');
        assert.deepEqual(Object.keys(payload).sort(), ['sol', 'updated_at']);
        assert.ok(!Number.isNaN(Date.parse(payload.updated_at)));
        writes.push({id, sol: payload.sol});
        return writes.length - 1 === failAt
          ? missing ? {data: [], error: null} : {error: {message: '連線失敗'}}
          : {data: [{id}], error: null};
      }})})};
    }},
  };
  vm.createContext(ctx);
  vm.runInContext(converter + importer, ctx);
  const row = ctx.toRow(ctx.DB[0]);
  assert.ok(!('updatedAt' in row));
  assert.ok(row.updated_at);
  await ctx.doImportSol();
  return {writes, alerts, closed, reloads};
}
(async () => {
  const success = await run();
  assert.deepEqual(success.writes, [{id: 'q1', sol: '新詳解'}, {id: 'q2', sol: '取代詳解'}]);
  assert.equal(success.closed, true);
  assert.equal(success.reloads, 1);
  assert.match(success.alerts[0], /成功匯入 2/);
  for (const missing of [false, true]) {
    const failed = await run(1, missing);
    assert.equal(failed.closed, false);
    assert.equal(failed.reloads, 1);
    assert.match(failed.alerts[0], /已成功匯入 1／2/);
  }
  const cancelled = await run(-1, false, false);
  assert.equal(cancelled.writes.length, 0);
  console.log('Solution import regression tests passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
