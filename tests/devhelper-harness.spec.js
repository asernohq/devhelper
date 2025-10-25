(() => {
  // ========== tiny test lib ==========
  const green = 'color:#0a0';
  const red   = 'color:#d22';
  const gray  = 'color:#888';

  const results = [];

  const normLF = s => s.replace(/\r\n?/g, '\n');
  const stripTrailEOL = s => s.replace(/[ \t]+$/gm, '');
  const stripFinalNL = s => s.endsWith('\n') ? s.slice(0, -1) : s;

  function diffIndex(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) if (a[i] !== b[i]) return i;
    return a.length === b.length ? -1 : len; // if lengths differ
  }
  function excerpt(s, idx, radius = 22) {
    const start = Math.max(0, idx - radius);
    const end   = Math.min(s.length, idx + radius);
    return s.slice(start, end).replace(/\n/g, '\\n');
  }

  function assertEq(name, got, exp) {
    let ok = false, note = '';
    if (exp instanceof RegExp) {
      ok = exp.test(got);
      note = ok ? '' : `Expected to match ${exp}`;
    } else if (typeof exp === 'function') {
      try {
        ok = !!exp(got);
        note = ok ? '' : `Predicate returned false`;
      } catch (e) {
        ok = false; note = `Predicate threw: ${e}`;
      }
    } else {
      ok = (got === exp);
      if (!ok) {
        const i = diffIndex(got, exp);
        note = `first diff @ ${i}\nGot ... "${excerpt(got, i)}"\nExp ... "${excerpt(exp, i)}"`;
      }
    }
    results.push({ name, ok, note });
    console.log(`%c${ok ? '✅ PASS' : '❌ FAIL'}%c ${name}`, ok ? green : red, '');
    if (!ok && note) console.log('%c' + note, gray);
  }

  // Loose comparator: ignore trailing EOL spaces and optional final newline
  function assertEqLoose(name, got, exp) {
    const ng = stripFinalNL(stripTrailEOL(normLF(got)));
    const ne = stripFinalNL(stripTrailEOL(normLF(exp)));
    if (ng === ne) {
      results.push({ name, ok: true });
      console.log(`%c✅ PASS%c ${name}`, green, '');
      return;
    }
    const i = diffIndex(ng, ne);
    const note = `first diff @ ${i}\nGot ... "${excerpt(ng, i)}"\nExp ... "${excerpt(ne, i)}"`;
    results.push({ name, ok: false, note });
    console.log(`%c❌ FAIL%c ${name}`, red, '');
    console.log('%c' + note, gray);
  }

  function assertNoThrow(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
      console.log(`%c✅ PASS%c ${name}`, green, '');
    } catch (e) {
      results.push({ name, ok: false, note: String(e) });
      console.log(`%c❌ FAIL%c ${name}`, red, '');
      console.log('%c' + e, gray);
    }
  }

  // ========== test data (your samples) ==========

  // 1) stripComments — mixed JS + PHP, remove leading # lines but keep strings/URLs
  const SC_in1 = [
`function foo(x) { 
  const url = "http://example.com?a=1"; 
  # legacy
  return x;  
}
\t<?php
\t# shebang-ish/comment
\techo "/* not a comment inside string */"; `
].join('\n');

  const SC_out1 =
`function foo(x) { 
  const url = "http://example.com?a=1"; 
  return x;  
}
\t<?php
\techo "/* not a comment inside string */"; 
`;

  // 10) stripComments — keep // and /* */ when inside strings
  const SC_in10 =
`const s = "http://x // not comment";
 const y = "/* not comment */";
if (ok)
{ doA(); } else
{ doB(); }`;

  const SC_out10 =
`const s = "http://x // not comment";
 const y = "/* not comment */";
if (ok)
{ doA(); } else
{ doB(); }`;

  // replaceForbidden
  const RF_in  = `\uFEFF"Smart ‘quotes' - and - dashes… -> arrows"\u00A0NBSP\npath → value — ok – fine … and quotes: “Hello”, ’world’`;
  const RF_out = `"Smart 'quotes' - and - dashes... -> arrows NBSP
path -> value - ok - fine ... and quotes: "Hello", 'world'`;

  // indentCode basic / else handling
  const IC_in =
`if (a){console.log(a)
\tif(b){doThing()}
else
{doOther()}
}
`;
const IC_out =
`if (a){
\tconsole.log(a)
\tif(b){
\t\tdoThing()
\t} else {
\t\tdoOther()
\t}
}
`;


  // ========== extra indentCode tests (JS #1–#5, PHP #1–#4) ==========
  // Helpers (lokale)
  const allMatch = (s, regs) => regs.every(r => r.test(s));
  const re  = (x) => new RegExp(x, 'm');   // multiline
  const reS = (x) => new RegExp(x, 'ms');  // dotAll + multiline

  // --- JS #1 ---
  const JS1_in =
`// JS #1: for-header, regex med charclass, http:// vs //
function scan(urls) { /* top-level comment */
  const results = [];  // keep me
  for (let i=0;i<urls.length;i++) { const u=urls[i]; // inline comment
    // ikke en kommentar: http://example.com, https://a.b
    const ok = /https?:\\/\\/[^\\s/]+(?:\\/[^\\s]*)?/i.test(u); if(ok){
      results.push({url:u, meta: { ts: Date.now(), flags: ["a","b","c"/*keep*/] }})
    } else { results.push({url:u, error:'invalid'}) }
  } // end for
  return results  /* no semicolon on purpose */
}`;
  // JS #1 predicate (robust)
  const JS1_pred = (out) => {
    const okForHeader =
      /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*urls\.length\s*;\s*i\+\+\s*\)\s*\{/.test(out);

    const okUDeclSameLine  = /\bconst\s+u\s*=\s*urls\[i];\s*\/\/\s*inline comment/m.test(out);
    const okUDeclNextLine  = /\bconst\s+u\s*=\s*urls\[i];\s*\n\s*\/\/\s*inline comment/m.test(out);

    const okUrlCommentLine =
      /ikke en kommentar:.*http:\/\/example\.com.*https:\/\/a\.b/m.test(out);

    // match som bogstavelig streng i output:
    const okRegex = out.includes("/https?:\\/\\/[^\\s/]+(?:\\/[^\\s]*)?/i.test(u)");

    const okEndForSameLine = /\}\s*\/\/\s*end for/m.test(out);
    const okEndForNextLine = /\}\s*\n\s*\/\/\s*end for/m.test(out);

    return okForHeader &&
           (okUDeclSameLine || okUDeclNextLine) &&
           okUrlCommentLine &&
           okRegex &&
           (okEndForSameLine || okEndForNextLine);
  };

  // --- JS #2 ---
  const JS2_in =
`// JS #2: template literals, nested blocks, else-stacking, missing semicolon
const make = (name) => {
  const say = (msg) => \`Hello, \${name}! You said: \${msg}\`;
  if (name === "O'Reilly") { /* edge quotes in string */ console.log(say("ok")) }
  else if (/\\b[a-z]+\\b/ig.test(name)) { console.log(\`Word: \${name}\`) } else
  { console.log("fallback") } /* } else should stay same-line */
  return { say } // <- missing ; before }
}`;
  const JS2_pred = out => allMatch(out, [
    reS(String.raw`\}\s*else if\s*\(`),
    reS(String.raw`\}\s*else\s*\{`),
    /`Hello, .* You said: .*`/s,
    reS(String.raw`return\s*\{\s*[\s\S]*?\bsay\b[\s\S]*?\}`)
  ]);

  // --- JS #3 ---
  const JS3_in =
`// JS #3: regex with class/ranges, escaped slash, comma spacing, semicolons inside ()
function crunch(list) {
  let out=[], rx=/^([A-Z][A-Za-z0-9_]+)\\/(?:v\\d+)?$/; // keep the slash
  list.forEach((x,y,z) => { // commas normalized to ", "
    if (rx.test(x)) { out.push(x) } else { out.push( x.replace(/[\\/\\\\]/g,'-') ) }
  }); return out;
}`;
  const JS3_pred = (out) => {
    const okForEachOpen =
      /forEach\(\s*\(\s*x\s*,\s*y\s*,\s*z\s*\)\s*=>\s*\{/.test(out);

    const okReplace =
      /x\.replace\(\s*\/\[\/\\\\]\/g\s*,\s*'-'\s*\)/.test(out) ||
      /x\.replace\(\s*\/\[\s*\/\s*\\\\\s*]\/g\s*,\s*'-'\s*\)/.test(out) ||
      out.includes("x.replace(/[\\/\\\\]/g,'-')"); // 1:1 fallback

    const okCloseReturn = /\}\);\s*\n\s*return\s+out\s*;/m.test(out);

    return okForEachOpen && okReplace && okCloseReturn;
  };

  // --- JS #4 ---
  const JS4_in =
`// JS #4: object literal, nested functions, comments + braces, paren depth
const mod = {
  init(){ let cfg=(a,b/*,c*/)=>({a:a,b:b}); return cfg(1,(2+3)); }, // ; inside ()
  build(x){ if(x){ { /* inner */ } } else { /* keep */ } return x*x },
  chain(){
    return [1,2,3].map(n=>({n, ok:(n%2===0)?true:false}))  // ternary + object
  }
}`;
  const JS4_pred = out => allMatch(out, [
    /=>\(\{/,           // no extra space before "{"
    /ternary \+ object/
  ]);

  // --- JS #5 ---
  const JS5_in =
`// JS #5: tricky // start vs http://, regex flags, trailing commas
function links(s){
  // "file://server/share" er ikke kommentar-start
  const parts = s.split(/\\s+/g); /* block
  comment */ const out=[];
  for (let p of parts) {
    if (/^https?:\\/\\/[^\\s]+$/i.test(p)) { out.push(p) }
    else { out.push(\`http://\${p}\`) } // inline comment at EOL
  }
  return out
}`;
  const JS5_pred = (out) => allMatch(out, [
    /"file:\/\/server\/share" er ikke kommentar-start/m,
    /\/\^?https\?:\\\/\\\/[^\s]+\$?\/i\.test\(p\)/m,
    /else\s*\{/m,
    /out\.push\(\s*`http:\/\/\$\{p\}`\s*\)/m
  ]);

  // --- PHP #1 ---
  const PHP1_in =
`<?php
#[\\Attribute] final class T0 { public function __construct(public string $n){} }

function format(array $rows): string {
\t$map = array_map(function ($r) { return $r['id'] ?? 0; }, $rows); // inline
\t$sum = array_sum($map); /* block comment */
\t$kind = match (true) {
\t\t$sum === 0 => 'empty',
\t\t$sum > 100 => 'big',
\t\tdefault => 'small',
\t}; // semicolon here

\t$txt = <<<TXT
IDs: {$sum}
/* not a real comment inside heredoc */
Line with 'quotes' and "double quotes".
TXT;

\t$raw = <<<'NOW'
Nowdoc keeps $variables and \\escapes literally.
/* still not a comment */
NOW;

\treturn $kind . "\\n" . $txt . "\\n" . $raw; // final return
}`;
  const PHP1_pred = (out) => allMatch(out, [
    /match\s*\(\s*true\s*\)\s*\{/m,
    /\};/m,
    /IDs:\s*{\$sum}/m,
    /\/\*\s*not a real comment inside heredoc\s*\*\//m,
    /Nowdoc keeps \$variables and \\escapes literally\./m,
    /\/\*\s*still not a comment\s*\*\//m,
    /return\s+\$kind\s*\.\s*"\\n"\s*\.\s*\$txt\s*\.\s*"\\n"\s*\.\s*\$raw;/m
  ]);

  // --- PHP #2 ---
  const PHP2_in =
`<?php
function filterUsers(array $users): array {
\t$out = [];
\tfor ($i = 0; $i < count($users); $i++) { // ; inside ()
\t\t$u = $users[$i];
\t\tif (preg_match('/^[A-Z][a-z]+(?:\\s[A-Z][a-z]+)?$/', $u['name'])) { // keep slashes
\t\t\t$out[] = [
\t\t\t\t'name' => $u['name'],
\t\t\t\t'email' => $u['email'] ?? null, /* maybe null */
\t\t\t];
\t\t} else { $out[] = ['name' => trim($u['name']), 'invalid' => true]; }
\t}
\t$names = array_map(fn($x) => $x['name'], $out); // arrow fn
\treturn $out;
}`;
  const PHP2_pred = (out) => {
    const okForHeader =
      /for\s*\(\s*\$i\s*=\s*0\s*;\s*\$i\s*<\s*count\(\s*\$users\s*\)\s*;\s*\$i\+\+\s*\)\s*\{/.test(out);

    const okPreg = out.includes(`preg_match('/^[A-Z][a-z]+(?:\\s[A-Z][a-z]+)?$/', $u['name'])`);

    const okArrow =
      /array_map\(\s*fn\s*\(\s*\$x\s*\)\s*=>\s*\$x\['name']\s*,\s*\$out\s*\)\s*;/.test(out);

    const okReturn = /return\s+\$out\s*;/.test(out);

    return okForHeader && okPreg && okArrow && okReturn;
  };

  // --- PHP #3 ---
  const PHP3_in =
`<?php
function pipeline(callable $step, array $data): array {
\t$wrap = function ($d) use ($step) {
\t\ttry {
\t\t\t$r = $step($d);
\t\t\tif (is_array($r)) { return $r; } else { return ['val' => $r]; }
\t\t} catch (\\Throwable $e) { /* keep me */ return ['error' => $e->getMessage()]; }
\t};
\t$res = [];
\tforeach ($data as $k => $v) {
\t\t$res[] = $wrap(['k' => $k, 'v' => $v,]);
\t}
\treturn $res /* missing semicolon on purpose before } */;
}`;
  const PHP3_pred = out => allMatch(out, [
    /\}\s+catch\s*\(\\Throwable \$e\)\s*\{/,
    /return \['val' => \$r];/,
    /\['k' => \$k, 'v' => \$v,]/
  ]);

  // --- PHP #4 ---
  const PHP4_in =
`<?php
function tricky($s) {
\t// not a comment start: http://example.com/path
\t$s = str_replace(['\\\\', '/'], ['-', '-'], $s); // normalize slashes
\tif (
\t\t$s !== '' &&
\t\t!preg_match('#^\\d{4}-\\d{2}-\\d{2}$#', $s) // YYYY-MM-DD
\t) {
\t\t$s = strtoupper($s);
\t} else { $s = strtolower($s); }
\treturn $s;
}`;
  const PHP4_pred = (out) => {
    const okHttp = /http:\/\/example\.com\/path/.test(out);

    const okPreg = out.includes("!preg_match('#^\\d{4}-\\d{2}-\\d{2}$#', $s)");

    const okReplace =
      /str_replace\(\s*\[\s*'\\\\'\s*,\s*'\/'\s*\]\s*,\s*\[\s*'-'\s*,\s*'-'\s*\]\s*,\s*\$s\s*\)/m.test(out) ||
      out.includes("str_replace(['\\\\', '/'], ['-', '-'], $s)");

    return okHttp && okPreg && okReplace;
  };

  // --- JS do/while ---
  const JS_DO_WHILE_in =
`do{
\twork()
} while (cond);`;
  const JS_DO_WHILE_pred = out => /\}\s+while\s*\(cond\);/.test(out);

  // --- keyword attachment ---
  const KW_attach_in =
`try { ok() }
catch(e){ handle(e) }
finally { cleanup() }
if (a) { x() }
else { y() }`;
  const KW_attach_pred = out =>
    /\}\s+catch\s*\(/.test(out) &&
    /\}\s+finally\s*\{/.test(out) &&
    /\}\s+else\s*\{/.test(out);

  // Runner til ekstra-tests (kaldes senere for korrekt rækkefølge)
  function runExtraIndentCodeTests() {
    assertEq('indentCode: JS#1 structure/regex/URL comments', indentCode(JS1_in), JS1_pred);
    assertEq('indentCode: JS#2 templates + else-if/else same-line', indentCode(JS2_in), JS2_pred);
    assertEq('indentCode: JS#3 regex, escapes, semicolons outside parens', indentCode(JS3_in), JS3_pred);
    assertEq('indentCode: JS#4 arrow-return object literal, no extra space before {', indentCode(JS4_in), JS4_pred);
    assertEq('indentCode: JS#5 http(s):// vs //, flags, comments at EOL', indentCode(JS5_in), JS5_pred);
    assertEq('indentCode: PHP#1 heredoc/nowdoc preserved + match braces', indentCode(PHP1_in), PHP1_pred);
    assertEq('indentCode: PHP#2 for-header intact, regex & arrow fn', indentCode(PHP2_in), PHP2_pred);
    assertEq('indentCode: PHP#3 try/catch same-line and arrays', indentCode(PHP3_in), PHP3_pred);
    assertEq('indentCode: PHP#4 comments with http:// and multiline condition', indentCode(PHP4_in), PHP4_pred);
    assertEq('indentCode: do { } while (...) same line after }', indentCode(JS_DO_WHILE_in), JS_DO_WHILE_pred);
    assertEq('indentCode: attach } with catch/finally/else (same line)', indentCode(KW_attach_in), KW_attach_pred);
  }

  // indentHtml / plain HTML
  const IH_in =
`<div><ul><li>One</li><li>Two</li></ul><p><strong>bold</strong> and <span>inline</span></p></div>

<section><header><h1>Title</h1></header><article><p>Text</p></article><footer>©</footer></section>`;
const IH_out =
`<div>
\t<ul>
\t\t<li>
\t\t\tOne
\t\t</li>
\t\t<li>
\t\t\tTwo
\t\t</li>
\t</ul>
\t<p>
\t\t<strong>bold</strong> and <span>inline</span>
\t</p>
</div>

<section>
\t<header>
\t\t<h1>
\t\t\tTitle
\t\t</h1>
\t</header>
\t<article>
\t\t<p>
\t\t\tText
\t\t</p>
\t</article>
\t<footer>
\t\t©
\t</footer>
</section>`;

  // indentLiteView — two cases
  const IL_in1 =
`{% block content %}<div>
\t{% if user %}
\t\t<p>Hello {{ user.name }}</p>
\t\t{% else %}<p>Guest</p>
\t{% endif %}
\t{% for i in [1,2,3] %}<span>{{ i }}</span>{% endfor %}
\t</div>{% endblock %}`;
  const IL_out1 =
`{% block content %}
\t<div>
\t\t{% if user %}
\t\t\t<p>Hello {{ user.name }}</p>
\t\t\t{% else %}<p>Guest</p>
\t\t{% endif %}
\t\t{% for i in [1,2,3] %}
\t\t\t<span>{{ i }}</span>
\t\t{% endfor %}
\t</div>
{% endblock %}`;

  const IL_in2 =
`<div>{% if a %}<p>A</p>{% elseif b %}<p>B</p>{% else %}<p>C</p>{% endif %}</div>`;
  const IL_out2 =
`<div>
\t{% if a %}
\t\t<p>A</p>
\t\t{% elseif b %}
\t\t<p>B</p>
\t\t{% else %}
\t\t<p>C</p>
\t{% endif %}
</div>`;

  // prettifyJSON — single JSON, NDJSON, and error-mixed stream
  const PJ_in1 = `{"a":1,"b":[2,3,],"c":{"d":4}}`;
  const PJ_out1 =
`{
  "a": 1,
  "b": [
    2,
    3
  ],
  "c": {
    "d": 4
  }
}
`;

  const PJ_in2 =
`{"a":1}
{"b":2}
{"c":3}`; // NDJSON happy path
  const PJ_pred2 = (out) => {
    return /{\s*"a": 1\s*}\s*\n{\s*"b": 2\s*}\s*\n{\s*"c": 3\s*}\s*\n?$/.test(out);
  };

  const PJ_in3 =
`{"a":1}
{"b":2}
// comment
oops not json
{"d":4}`;
  const PJ_pred3 = (out) => {
    return out.includes(`"a": 1`) &&
           out.includes(`"b": 2`) &&
           /JSON parse error/i.test(out) &&
           out.includes(`"d": 4`);
  };

  // prettifyCSS
  const PC_in =
`a {color: red;background: black}
.btn {padding: 8px 12px;border: 1px solid #333}
@media (min-width: 600px) { .grid { display: grid; grid-template-columns: 1fr 1fr } }
/* header */
.hero { background: url(data:image/svg+xml;utf8,<svg viewBox="0 0 1 1"></svg>); content: "a:b,c"; margin: 0, 10px }
.code { font-family: "SF Mono", "Courier New", monospace }`;

  const PC_pred = (out) => {
    return out.includes('\n.btn {\n') &&
           out.includes('@media (min-width: 600px) {\n\t.grid {\n') &&
           out.includes('url(data:image/svg+xml;utf8,<svg viewBox="0 0 1 1"></svg>)') &&
           /font-family:\s*"SF Mono", "Courier New", monospace/.test(out);
  };

  // small inline HTML fragment (indentHtml)
  const IH2_in = `<p><span>Hi</span> there <strong>friend</strong>!</p><div><em>emph</em></div>`;
  const IH2_out =
`<p>
\t<span>Hi</span> there <strong>friend</strong>!
</p>
<div>
\t<em>emph</em>
</div>`;

  // ========== test runner ==========
  console.log('%cRunning DevHelper tests…', 'color:#09f');

  // Sanity: functions exist
  [
    'stripComments','replaceForbidden','prettifyJSON','prettifyCSS',
    'indentCode','indentHtml','indentLiteView'
  ].forEach(fn => assertNoThrow(`exists: ${fn}`, () => {
    if (typeof window[fn] !== 'function') throw new Error(`${fn} missing`);
  }));

  // stripComments (loose comparison: ignore trailing EOL spaces + optional final NL)
  assertEqLoose('stripComments: remove # lines, keep strings/URLs', stripComments(SC_in1), SC_out1);
  assertEqLoose('stripComments: preserve // and /* */ inside strings', stripComments(SC_in10), SC_out10);
  // Optional modes (exact; these end with a newline by design)
  assertEq('stripComments: HTML comments (optional)', stripComments(`<div><!-- x --><p>y</p></div>`, { stripHtmlComments:true }), `<div><p>y</p></div>\n`);
  assertEq('stripComments: Twig comments (optional)', stripComments(`{# note #}<div>y</div>`, { stripTwigComments:true }), `<div>y</div>\n`);
  // Idempotent (exact)
  assertEq('stripComments: idempotent', stripComments(SC_in1), stripComments(stripComments(SC_in1)));

  // replaceForbidden (exact; includes dangling-quote handling before NBSP)
  assertEq('replaceForbidden: normalize punctuation/BOM/NBSP', replaceForbidden(RF_in), RF_out);
  assertEq('replaceForbidden: empty input', replaceForbidden(''), '');

  // indentCode (exact)
  assertEq('indentCode: blocks and else', indentCode(IC_in), IC_out);
  assertEq('indentCode: idempotent', indentCode(IC_out), IC_out);

  // ekstra indentCode-cases (køres her for korrekt rækkefølge i loggen)
  runExtraIndentCodeTests();

  // indentHtml (loose for small fragment to avoid platform whitespace nits; exact for others)
  assertEqLoose('indentHtml: structure & inline tags', indentHtml(IH_in), IH_out);
  assertEqLoose('indentHtml: small fragment', indentHtml(IH2_in), IH2_out);
  assertEq('indentHtml: idempotent', indentHtml(IH_out), IH_out);

  // indentLiteView (exact)
  assertEq('indentLiteView: block/if/for', indentLiteView(IL_in1), IL_out1);
  assertEq('indentLiteView: mixed directives inline', indentLiteView(IL_in2), IL_out2);
  assertEq('indentLiteView: idempotent', indentLiteView(IL_out1), IL_out1);

  // prettifyJSON (exact/predicate)
  assertEq('prettifyJSON: single object (+trailing commas)', prettifyJSON(PJ_in1), PJ_out1);
  assertEq('prettifyJSON: NDJSON happy path', prettifyJSON(PJ_in2), PJ_pred2);
  assertEq('prettifyJSON: mixed with errors', prettifyJSON(PJ_in3), PJ_pred3);
  assertEq('prettifyJSON: empty -> empty', prettifyJSON(''), '');

  // prettifyCSS (predicate + exact idempotency)
  assertEq('prettifyCSS: formatting & preservation', prettifyCSS(PC_in), PC_pred);
  assertEq('prettifyCSS: idempotent', prettifyCSS(prettifyCSS(PC_in)), prettifyCSS(PC_in));

  // Summary
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log('%c— — —', gray);
  console.log(`${pass} passed, ${fail} failed out of ${results.length} assertions.`);
  if (fail) {
    console.log('%cFailed tests:', red);
    results.filter(r => !r.ok).forEach(r => {
      console.log(`- ${r.name}`);
      if (r.note) console.log('  ' + r.note.split('\n').join('\n  '));
    });
  }
  console.log('%cDone.', gray);
})();
