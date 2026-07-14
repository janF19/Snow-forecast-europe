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
