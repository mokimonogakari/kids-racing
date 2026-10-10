import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Voice } from '../js/voice.js';
test('voice chatter is not queued; important cues replace it and stale callbacks cannot unduck', () => {
  const spoken = [], activity = [], captions = [];
  globalThis.window = { speechSynthesis: {getVoices:()=>[{lang:'ja-JP',localService:true,name:'Kyoko'}],cancel(){},resume(){},speak(u){spoken.push(u)},addEventListener(){}} };
  globalThis.SpeechSynthesisUtterance = class {constructor(text){this.text=text}};
  const v = new Voice({onActivity:x=>activity.push(x),onText:x=>captions.push(x)});
  try {
    assert.equal(v.say('どん！'), true);
    assert.equal(v.say('おいしそう！', {interrupt:false}), false);
    assert.equal(spoken.length, 1);
    v.say('ゴール！');
    spoken[0].onend(); assert.equal(activity.at(-1), true);
    spoken[1].onend(); assert.equal(activity.at(-1), false);
    assert.deepEqual(captions, ['どん！','ゴール！']);
    v.enabled = false; assert.equal(v.say('あそぼう'), false);
  } finally { v.stop(); delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; }
});
test('captions remain available without speech synthesis', () => {
  const captions = []; const v = new Voice({onText:t=>captions.push(t)});
  assert.equal(v.say('よーい！'), false); assert.deepEqual(captions,['よーい！']); v.stop();
});
