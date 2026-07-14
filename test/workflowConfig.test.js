const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('weather workflow uses the supported dependency and deploy contract', () => {
  const text = fs.readFileSync('.github/workflows/weather-cron.yml', 'utf8');
  assert.match(text, /python-version:\s*['"]3\.12['"]/);
  assert.match(text, /python -m pip install -r requirements\.txt/);
  assert.doesNotMatch(text, /pandas|pip install requests==/);
  assert.match(text, /node scripts\/validateWeatherData\.js/);
  assert.match(text, /id:\s*publish/);
  assert.match(text, /steps\.publish\.outputs\.changed == 'true'/);
  assert.match(text, /curl --fail-with-body/);
});

test('application CI pins Node 24 and Python 3.12 and runs the full gate', () => {
  const text = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(text, /node-version:\s*['"]24['"]/);
  assert.match(text, /python-version:\s*['"]3\.12['"]/);
  for (const command of ['npm ci', 'npm run build', 'npm test']) assert.match(text, new RegExp(command.replaceAll(' ', '\\s+')));
  assert.match(text, /paths-ignore:[\s\S]*weather_dataFull_7\.json/);
});
