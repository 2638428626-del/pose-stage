/* 3D 姿势预演台 · 渲染引擎
 * 纯程序化几何，无外部模型 / 纹理；WebGL1 单程序渲染。 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var DEG = PI / 180;
  var IDENT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var IDENT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  /* ---------------- 向量与矩阵 ---------------- */
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(a) {
    var l = Math.sqrt(dot3(a, a)) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

  function m3Mul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
      a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
      a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
      a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
      a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
      a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
      a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  }
  function m3Transpose(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; }
  function m3RotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function m3RotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function m3RotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function m3Euler(x, y, z) { return m3Mul(m3RotY(y), m3Mul(m3RotX(x), m3RotZ(z))); }

  function m3AxisAngle(axis, angle) {
    var a = norm3(axis);
    var x = a[0], y = a[1], z = a[2];
    var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c
    ];
  }

  function m3Orthonormalize(m) {
    var c0 = norm3([m[0], m[3], m[6]]);
    var c1 = [m[1], m[4], m[7]];
    var d = dot3(c0, c1);
    c1 = norm3([c1[0] - c0[0] * d, c1[1] - c0[1] * d, c1[2] - c0[2] * d]);
    var c2 = cross3(c0, c1);
    return [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
  }

  function m4Mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }
  function m4FromRot3(r) {
    return new Float32Array([
      r[0], r[3], r[6], 0,
      r[1], r[4], r[7], 0,
      r[2], r[5], r[8], 0,
      0, 0, 0, 1
    ]);
  }
  function m4Model(offset, r3) {
    var m = m4FromRot3(r3 || IDENT3);
    m[12] = offset[0]; m[13] = offset[1]; m[14] = offset[2];
    return m;
  }
  function m4Perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  function m4LookAt(eye, center, up) {
    var z = norm3(sub3(eye, center));
    var x = norm3(cross3(up, z));
    var y = cross3(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
    ]);
  }
  function m3FromMat4(m) {
    return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  }
  function xformPoint(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
  }
  function translationOf(m) { return [m[12], m[13], m[14]]; }
  function normalMat(model, s) {
    var sx = s[0] * s[0], sy = s[1] * s[1], sz = s[2] * s[2];
    var c0 = [model[0] / sx, model[1] / sx, model[2] / sx];
    var c1 = [model[4] / sy, model[5] / sy, model[6] / sy];
    var c2 = [model[8] / sz, model[9] / sz, model[10] / sz];
    return [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
  }

  /* ---------------- 骨架 ---------------- */
  var BONES = [
    { id: 'hips', parent: null, offset: [0, 0.98, 0], label: '胯', pick: true, r: 0.05 },
    { id: 'spine', parent: 'hips', offset: [0, 0.12, 0], label: '腰', pick: true, r: 0.05 },
    { id: 'chest', parent: 'spine', offset: [0, 0.20, 0], label: '胸', pick: true, r: 0.05 },
    { id: 'neck', parent: 'chest', offset: [0, 0.18, 0], label: '颈', pick: false },
    { id: 'head', parent: 'neck', offset: [0, 0.08, 0], label: '头', pick: true, r: 0.05 },

    { id: 'armL', parent: 'chest', offset: [0.152, 0.122, 0], label: '左肩', pick: true, r: 0.058 },
    { id: 'forearmL', parent: 'armL', offset: [0.012, -0.28, 0], label: '左肘', pick: true, r: 0.048 },
    { id: 'handL', parent: 'forearmL', offset: [0, -0.26, 0], label: '左手', pick: true, r: 0.036 },
    { id: 'armR', parent: 'chest', offset: [-0.152, 0.122, 0], label: '右肩', pick: true, r: 0.058 },
    { id: 'forearmR', parent: 'armR', offset: [-0.012, -0.28, 0], label: '右肘', pick: true, r: 0.048 },
    { id: 'handR', parent: 'forearmR', offset: [0, -0.26, 0], label: '右手', pick: true, r: 0.036 },

    { id: 'thighL', parent: 'hips', offset: [0.092, -0.04, 0], label: '左胯', pick: true, r: 0.062 },
    { id: 'shinL', parent: 'thighL', offset: [0, -0.44, 0], label: '左膝', pick: true, r: 0.052 },
    { id: 'footL', parent: 'shinL', offset: [0, -0.43, 0], label: '左脚', pick: true, r: 0.038 },
    { id: 'thighR', parent: 'hips', offset: [-0.092, -0.04, 0], label: '右胯', pick: true, r: 0.062 },
    { id: 'shinR', parent: 'thighR', offset: [0, -0.44, 0], label: '右膝', pick: true, r: 0.052 },
    { id: 'footR', parent: 'shinR', offset: [0, -0.43, 0], label: '右脚', pick: true, r: 0.038 }
  ];
  var BONE_MAP = {};
  for (var bi = 0; bi < BONES.length; bi++) BONE_MAP[BONES[bi].id] = BONES[bi];

  var PARTS = [
    { kind: 'sphere', bone: 'hips', at: [0, 0.005, 0], scale: [0.144, 0.104, 0.100], c: 'body' },
    { kind: 'segment', a: 'hips', b: 'chest', r: 0.088, c: 'body' },
    { kind: 'sphere', bone: 'chest', at: [0, 0.072, 0], scale: [0.150, 0.166, 0.108], c: 'body' },
    { kind: 'segment', a: 'neck', b: 'head', r: 0.038, c: 'body' },
    { kind: 'sphere', bone: 'head', at: [0, 0.104, 0], scale: [0.101, 0.119, 0.107], c: 'body' },
    { kind: 'sphere', bone: 'head', at: [0, 0.006, 0.104], scale: [0.019, 0.025, 0.030], c: 'joint' },

    { kind: 'segment', a: 'armL', b: 'forearmL', r: 0.044, c: 'body' },
    { kind: 'segment', a: 'forearmL', b: 'handL', r: 0.038, c: 'body' },
    { kind: 'sphere', bone: 'handL', at: [0, -0.060, 0], scale: [0.031, 0.062, 0.024], c: 'body' },
    { kind: 'segment', a: 'armR', b: 'forearmR', r: 0.044, c: 'body' },
    { kind: 'segment', a: 'forearmR', b: 'handR', r: 0.038, c: 'body' },
    { kind: 'sphere', bone: 'handR', at: [0, -0.060, 0], scale: [0.031, 0.062, 0.024], c: 'body' },

    { kind: 'segment', a: 'thighL', b: 'shinL', r: 0.068, c: 'body' },
    { kind: 'segment', a: 'shinL', b: 'footL', r: 0.052, c: 'body' },
    { kind: 'box', bone: 'footL', at: [0, -0.026, 0.044], scale: [0.050, 0.040, 0.098], c: 'body' },
    { kind: 'segment', a: 'thighR', b: 'shinR', r: 0.068, c: 'body' },
    { kind: 'segment', a: 'shinR', b: 'footR', r: 0.052, c: 'body' },
    { kind: 'box', bone: 'footR', at: [0, -0.026, 0.044], scale: [0.050, 0.040, 0.098], c: 'body' }
  ];

  var FRAMES = {
    full: { label: '全身', target: 0.90, height: 1.98 },
    medium: { label: '七分身', target: 1.13, height: 1.50 },
    half: { label: '半身', target: 1.34, height: 1.02 },
    close: { label: '特写', target: 1.60, height: 0.56 }
  };

  var PALETTE = {
    warm: {
      bg: [0.929, 0.914, 0.886], floor: [0.854, 0.831, 0.789],
      body: [0.792, 0.760, 0.702], joint: [0.690, 0.649, 0.585],
      prop: [0.836, 0.810, 0.762], shadow: [0.14, 0.12, 0.10]
    },
    light: {
      bg: [0.976, 0.971, 0.957], floor: [0.922, 0.912, 0.890],
      body: [0.800, 0.769, 0.714], joint: [0.698, 0.663, 0.602],
      prop: [0.878, 0.861, 0.827], shadow: [0.14, 0.12, 0.10]
    },
    dark: {
      bg: [0.169, 0.176, 0.184], floor: [0.196, 0.204, 0.212],
      body: [0.824, 0.796, 0.745], joint: [0.655, 0.624, 0.569],
      prop: [0.290, 0.302, 0.314], shadow: [0, 0, 0]
    }
  };

  var ACCENT = [0.886, 0.294, 0.231];

  /* ---------------- 几何 ---------------- */
  function buildSphere(lat, lon) {
    var pos = [], nor = [], idx = [];
    for (var i = 0; i <= lat; i++) {
      var th = i / lat * PI;
      for (var j = 0; j <= lon; j++) {
        var ph = j / lon * 2 * PI;
        var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        pos.push(x, y, z);
        nor.push(x, y, z);
      }
    }
    for (i = 0; i < lat; i++) {
      for (j = 0; j < lon; j++) {
        var a = i * (lon + 1) + j, b = a + 1, c = a + lon + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return { pos: pos, nor: nor, idx: idx };
  }

  function buildCylinder(seg) {
    var pos = [], nor = [], idx = [], j, a, x, z;
    for (j = 0; j <= seg; j++) {
      a = j / seg * 2 * PI;
      x = Math.cos(a); z = Math.sin(a);
      pos.push(x, -0.5, z, x, 0.5, z);
      nor.push(x, 0, z, x, 0, z);
    }
    for (j = 0; j < seg; j++) {
      var i0 = j * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
    var topCenter = pos.length / 3;
    pos.push(0, 0.5, 0); nor.push(0, 1, 0);
    var botCenter = pos.length / 3;
    pos.push(0, -0.5, 0); nor.push(0, -1, 0);
    var topStart = (seg + 1) * 2;
    var botStart = topStart + (seg + 1);
    for (j = 0; j <= seg; j++) {
      a = j / seg * 2 * PI;
      x = Math.cos(a); z = Math.sin(a);
      pos.push(x, 0.5, z); nor.push(0, 1, 0);
    }
    for (j = 0; j <= seg; j++) {
      a = j / seg * 2 * PI;
      x = Math.cos(a); z = Math.sin(a);
      pos.push(x, -0.5, z); nor.push(0, -1, 0);
    }
    for (j = 0; j < seg; j++) {
      idx.push(topCenter, topStart + j, topStart + j + 1);
      idx.push(botCenter, botStart + j + 1, botStart + j);
    }
    return { pos: pos, nor: nor, idx: idx };
  }

  function buildBox() {
    var faces = [
      { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
      { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
      { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
      { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] }
    ];
    var pos = [], nor = [], idx = [], vi = 0;
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      for (var k = 0; k < 4; k++) {
        pos.push(face.v[k][0], face.v[k][1], face.v[k][2]);
        nor.push(face.n[0], face.n[1], face.n[2]);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
    return { pos: pos, nor: nor, idx: idx };
  }

  function buildDisc(seg) {
    var pos = [0, 0, 0], nor = [0, 1, 0], idx = [];
    for (var j = 0; j <= seg; j++) {
      var a = j / seg * 2 * PI;
      pos.push(Math.cos(a), 0, Math.sin(a));
      nor.push(0, 1, 0);
    }
    for (j = 0; j < seg; j++) idx.push(0, j + 2, j + 1);
    return { pos: pos, nor: nor, idx: idx };
  }

  /* ---------------- 着色器 ---------------- */
  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'uniform mat4 uMVP;',
    'uniform mat4 uModel;',
    'uniform mat3 uNormalMat;',
    'varying vec3 vN;',
    'varying vec3 vWorld;',
    'varying vec3 vLocal;',
    'void main() {',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorld = wp.xyz;',
    '  vLocal = aPos;',
    '  vN = uNormalMat * aNormal;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec3 vN;',
    'varying vec3 vWorld;',
    'varying vec3 vLocal;',
    'uniform vec3 uColor;',
    'uniform vec3 uLight;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uBg;',
    'uniform vec3 uRimColor;',
    'uniform float uRim;',
    'uniform float uAmbient;',
    'uniform float uDiffuse;',
    'uniform float uFill;',
    'uniform float uAlpha;',
    'uniform float uMode;',
    'void main() {',
    '  if (uMode > 2.5) {',
    '    gl_FragColor = vec4(uColor, 1.0);',
    '    return;',
    '  }',
    '  if (uMode > 1.5) {',
    '    float d = length(vLocal.xz);',
    '    float a = smoothstep(1.0, 0.1, d) * uAlpha;',
    '    gl_FragColor = vec4(uColor, a);',
    '    return;',
    '  }',
    '  vec3 n = normalize(vN);',
    '  float ndl = max(dot(n, uLight), 0.0);',
    '  float hemi = 0.55 + 0.45 * n.y;',
    '  vec3 col = uColor * (uAmbient * hemi + uDiffuse * ndl);',
    '  vec3 viewDir = normalize(uCamPos - vWorld);',
    '  col += uColor * uFill * max(dot(n, viewDir), 0.0);',
    '  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);',
    '  col += uRimColor * fres * uRim;',
    '  if (uMode > 0.5) {',
    '    float d = length(vWorld.xz);',
    '    col = mix(col, uBg, smoothstep(1.4, 5.2, d));',
    '  }',
    '  gl_FragColor = vec4(col, uAlpha);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function createCore(canvas) {
    var gl = canvas.getContext('webgl', {
      alpha: false, antialias: true, depth: true,
      preserveDrawingBuffer: true, powerPreference: 'default'
    });
    if (!gl) {
      gl = canvas.getContext('experimental-webgl');
    }
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    gl.useProgram(program);

    var loc = {
      pos: gl.getAttribLocation(program, 'aPos'),
      nor: gl.getAttribLocation(program, 'aNormal'),
      mvp: gl.getUniformLocation(program, 'uMVP'),
      model: gl.getUniformLocation(program, 'uModel'),
      normal: gl.getUniformLocation(program, 'uNormalMat'),
      color: gl.getUniformLocation(program, 'uColor'),
      light: gl.getUniformLocation(program, 'uLight'),
      cam: gl.getUniformLocation(program, 'uCamPos'),
      bg: gl.getUniformLocation(program, 'uBg'),
      rimColor: gl.getUniformLocation(program, 'uRimColor'),
      rim: gl.getUniformLocation(program, 'uRim'),
      ambient: gl.getUniformLocation(program, 'uAmbient'),
      diffuse: gl.getUniformLocation(program, 'uDiffuse'),
      fill: gl.getUniformLocation(program, 'uFill'),
      alpha: gl.getUniformLocation(program, 'uAlpha'),
      mode: gl.getUniformLocation(program, 'uMode')
    };
    gl.enableVertexAttribArray(loc.pos);
    gl.enableVertexAttribArray(loc.nor);

    function makeGeo(data) {
      var vbo = gl.createBuffer();
      var interleaved = new Float32Array(data.pos.length + data.nor.length);
      for (var i = 0, n = data.pos.length / 3; i < n; i++) {
        interleaved[i * 6] = data.pos[i * 3];
        interleaved[i * 6 + 1] = data.pos[i * 3 + 1];
        interleaved[i * 6 + 2] = data.pos[i * 3 + 2];
        interleaved[i * 6 + 3] = data.nor[i * 3];
        interleaved[i * 6 + 4] = data.nor[i * 3 + 1];
        interleaved[i * 6 + 5] = data.nor[i * 3 + 2];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
      var ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.idx), gl.STATIC_DRAW);
      return { vbo: vbo, ibo: ibo, count: data.idx.length };
    }

    var geoms = {
      sphere: makeGeo(buildSphere(16, 20)),
      cylinder: makeGeo(buildCylinder(16)),
      box: makeGeo(buildBox()),
      disc: makeGeo(buildDisc(56))
    };

    var core = {
      canvas: canvas,
      gl: gl,
      program: program,
      loc: loc,
      geoms: geoms,
      vp: null,
      view: null,
      eye: [0, 0, 0],
      viewport: { x: 0, y: 0, w: canvas.width, h: canvas.height },
      viewCss: { x: 0, y: 0, w: 1, h: 1 },
      cssW: 1,
      cssH: 1,
      dpr: 1,
      dispose: function () {
        var keys = ['sphere', 'cylinder', 'box', 'disc'];
        for (var i = 0; i < keys.length; i++) {
          var g = geoms[keys[i]];
          gl.deleteBuffer(g.vbo);
          gl.deleteBuffer(g.ibo);
        }
        gl.deleteProgram(program);
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
    return core;
  }

  /* ---------------- 绘制工具 ---------------- */
  function bindGeo(core, geo) {
    var gl = core.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.vbo);
    gl.vertexAttribPointer(core.loc.pos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(core.loc.nor, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.ibo);
  }

  function drawGeo(core, geo, model, scale, color, opts) {
    var gl = core.gl;
    var l = core.loc;
    gl.uniformMatrix4fv(l.mvp, false, m4Mul(core.vp, model));
    gl.uniformMatrix4fv(l.model, false, model);
    gl.uniformMatrix3fv(l.normal, false, normalMat(model, scale));
    gl.uniform3fv(l.color, color);
    gl.uniform1f(l.mode, opts && opts.mode ? opts.mode : 0);
    gl.uniform1f(l.alpha, opts && opts.alpha !== undefined ? opts.alpha : 1);
    bindGeo(core, geo);
    gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
  }

  function segmentMatrix(a, b, radius) {
    var d = sub3(b, a);
    var len = Math.sqrt(dot3(d, d)) || 0.0001;
    var up = scale3(d, 1 / len);
    var ref = Math.abs(up[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    var right = norm3(cross3(ref, up));
    var fwd = cross3(up, right);
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return {
      m: new Float32Array([
        right[0] * radius, right[1] * radius, right[2] * radius, 0,
        up[0] * len, up[1] * len, up[2] * len, 0,
        fwd[0] * radius, fwd[1] * radius, fwd[2] * radius, 0,
        mid[0], mid[1], mid[2], 1
      ]),
      s: [radius, len, radius]
    };
  }

  function attach(worldM, at, scale) {
    var m = m4Mul(worldM, m4Model(at, IDENT3));
    m[0] *= scale[0]; m[1] *= scale[0]; m[2] *= scale[0];
    m[4] *= scale[1]; m[5] *= scale[1]; m[6] *= scale[1];
    m[8] *= scale[2]; m[9] *= scale[2]; m[10] *= scale[2];
    return m;
  }

  function evaluateRig(pose) {
    var world = {};
    for (var i = 0; i < BONES.length; i++) {
      var b = BONES[i];
      var local = pose.local[b.id] || IDENT3;
      var off = b.offset;
      if (!b.parent) {
        off = [b.offset[0] + pose.root[0], b.offset[1] + pose.root[1], b.offset[2] + pose.root[2]];
      }
      var m = m4Model(off, local);
      world[b.id] = b.parent ? m4Mul(world[b.parent], m) : m;
    }
    return world;
  }

  function poseBounds(world) {
    var maxY = world.head[13] + 0.225;
    var hl = world.handL[13] + 0.07;
    var hr = world.handR[13] + 0.07;
    if (hl > maxY) maxY = hl;
    if (hr > maxY) maxY = hr;
    var minY = Math.min(world.footL[13], world.footR[13]) - 0.07;
    return { minY: minY, maxY: maxY };
  }

  function cameraOf(st, bounds) {
    var cam = st.camera;
    var fov = 2 * Math.atan(12 / cam.lens);
    var frame = FRAMES[cam.frame] || FRAMES.full;
    var targetY = frame.target;
    var height = frame.height;
    if (cam.frame === 'full' && bounds) {
      var span = (bounds.maxY - bounds.minY) + 0.26;
      if (span > height) {
        height = span;
        targetY = (bounds.maxY + bounds.minY) / 2;
      }
    }
    var dist = (height / (2 * Math.tan(fov / 2)) + 0.34) * cam.zoom;
    var target = [0, targetY, 0];
    var pitch = cam.pitch;
    var eye = [
      target[0] + Math.sin(cam.yaw) * Math.cos(pitch) * dist,
      target[1] + Math.sin(pitch) * dist,
      target[2] + Math.cos(cam.yaw) * Math.cos(pitch) * dist
    ];
    return { fov: fov, eye: eye, target: target, dist: dist };
  }

  function drawScene(core, st, isExport) {
    var gl = core.gl;
    var l = core.loc;
    var pal = PALETTE[st.scene.bg] || PALETTE.warm;
    var world = evaluateRig(st.pose);

    gl.viewport(core.viewport.x, core.viewport.y, core.viewport.w, core.viewport.h);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(pal.bg[0], pal.bg[1], pal.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    var cam = cameraOf(st, st.camera.frame === 'full' ? poseBounds(world) : null);
    var view = m4LookAt(cam.eye, cam.target, [0, 1, 0]);
    var proj = m4Perspective(cam.fov, 0.75, 0.05, 90);
    core.vp = m4Mul(proj, view);
    core.view = view;
    core.eye = cam.eye;

    var ld = st.light;
    var az = ld.az * DEG, el = ld.el * DEG;
    var lightDir = norm3([
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el)
    ]);

    gl.uniform3fv(l.light, lightDir);
    gl.uniform3fv(l.cam, cam.eye);
    gl.uniform3fv(l.bg, pal.bg);
    gl.uniform3fv(l.rimColor, [0.95, 0.93, 0.88]);
    gl.uniform1f(l.rim, st.light.rim ? 0.20 : 0.0);
    gl.uniform1f(l.ambient, 0.46);
    gl.uniform1f(l.diffuse, 0.66 * st.light.intensity);
    gl.uniform1f(l.fill, 0.20);
    gl.uniform1f(l.alpha, 1);

    // 地面
    var floorModel = m4Model([0, 0, 0], IDENT3);
    floorModel[0] = 7; floorModel[5] = 1; floorModel[10] = 7;
    drawGeo(core, core.geoms.disc, floorModel, [7, 1, 7], pal.floor, { mode: 1 });

    // 道具
    var prop = st.scene.prop;
    if (prop === 'platform') {
      var pm = m4Model([0, 0.035, 0], IDENT3);
      pm[0] = 0.62; pm[5] = 0.07; pm[10] = 0.62;
      drawGeo(core, core.geoms.cylinder, pm, [0.62, 0.07, 0.62], pal.prop, {});
    } else if (prop === 'stool') {
      var sm = m4Model([0.62, 0.22, 0.04], IDENT3);
      sm[0] = 0.21; sm[5] = 0.22; sm[10] = 0.21;
      drawGeo(core, core.geoms.box, sm, [0.21, 0.22, 0.21], pal.prop, {});
    } else if (prop === 'wall') {
      var wm = m4Model([0, 0.52, -0.72], IDENT3);
      wm[0] = 0.86; wm[5] = 0.52; wm[10] = 0.12;
      drawGeo(core, core.geoms.box, wm, [0.86, 0.52, 0.12], pal.prop, {});
    }

    // 人偶
    for (var i = 0; i < PARTS.length; i++) {
      var p = PARTS[i];
      if (p.kind === 'segment') {
        var a = translationOf(world[p.a]);
        var b = translationOf(world[p.b]);
        var seg = segmentMatrix(a, b, p.r);
        drawGeo(core, core.geoms.cylinder, seg.m, seg.s, pal[p.c], {});
      } else if (p.kind === 'sphere') {
        var mm = attach(world[p.bone], p.at, p.scale);
        drawGeo(core, core.geoms.sphere, mm, p.scale, pal[p.c], {});
      } else {
        var bm = attach(world[p.bone], p.at, p.scale);
        drawGeo(core, core.geoms.box, bm, p.scale, pal[p.c], {});
      }
    }

    // 关节球
    for (i = 0; i < BONES.length; i++) {
      var bone = BONES[i];
      if (!bone.pick) continue;
      var isSel = !isExport && st.selected === bone.id;
      var base = bone.r || 0.046;
      var r = isSel ? base * 1.28 : base;
      var jm = attach(world[bone.id], [0, 0, 0], [r, r, r]);
      drawGeo(core, core.geoms.sphere, jm, [r, r, r], isSel ? ACCENT : pal.joint,
        isSel ? { mode: 3 } : {});
    }

    // 接触阴影
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    var lightXZ = norm3([lightDir[0], 0, lightDir[2]]);
    var shOff = [-lightXZ[0] * 0.16, 0.004, -lightXZ[2] * 0.16];
    var shRot = m3AxisAngle([0, 1, 0], Math.atan2(lightXZ[0], lightXZ[2]) - PI / 2);
    var shModel = m4Model(shOff, shRot);
    var shS = [0.52, 1, 0.33];
    shModel[0] *= shS[0]; shModel[1] *= shS[0]; shModel[2] *= shS[0];
    shModel[4] *= shS[1]; shModel[5] *= shS[1]; shModel[6] *= shS[1];
    shModel[8] *= shS[2]; shModel[9] *= shS[2]; shModel[10] *= shS[2];
    drawGeo(core, core.geoms.disc, shModel, shS, pal.shadow, {
      mode: 2, alpha: st.scene.bg === 'dark' ? 0.42 : 0.30
    });
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    core.lastWorld = world;
  }

  /* ---------------- 引擎 ---------------- */
  function Engine(canvas) {
    this.canvas = canvas;
    this.state = {
      pose: { root: [0, 0, 0], local: {} },
      selected: null,
      camera: { yaw: 0, pitch: 4 * DEG, frame: 'full', lens: 50, zoom: 1 },
      light: { az: 315, el: 38, intensity: 1, rim: true },
      scene: { bg: 'warm', prop: 'none' }
    };
    resetPoseTo(this.state, null);
    this.core = null;
    this.dirty = true;
    this.running = false;
    this.lost = false;
    this.onFallback = null;
    this.onContextLost = null;
    this.onReady = null;
    this.loopBound = this.loop.bind(this);
    this.init();
  }

  function resetPoseTo(st, def) {
    st.pose.local = {};
    for (var i = 0; i < BONES.length; i++) st.pose.local[BONES[i].id] = IDENT3;
    st.pose.local.armL = m3RotZ(4 * DEG);
    st.pose.local.armR = m3RotZ(-4 * DEG);
    st.pose.local.forearmL = m3RotX(-8 * DEG);
    st.pose.local.forearmR = m3RotX(-8 * DEG);
    st.pose.local.thighL = m3RotZ(1.5 * DEG);
    st.pose.local.thighR = m3RotZ(-1.5 * DEG);
    st.pose.root = [0, 0, 0];
    if (def) {
      if (def.root) st.pose.root = def.root.slice();
      var bones = def.bones || {};
      for (var id in bones) {
        if (!bones.hasOwnProperty(id) || !BONE_MAP[id]) continue;
        var e = bones[id];
        st.pose.local[id] = m3Euler(e[0] * DEG, e[1] * DEG, e[2] * DEG);
      }
    }
  }

  Engine.prototype.init = function () {
    if (!this.core) {
      try {
        this.core = createCore(this.canvas);
      } catch (e) {
        this.core = null;
      }
    }
    if (!this.core) {
      if (this.onFallback) this.onFallback();
      return;
    }
    this.lost = false;
    this.resize();
    this.start();
    this.bindEvents();
    if (this.onReady) this.onReady();
  };

  Engine.prototype.bindEvents = function () {
    var self = this;
    if (this._bound) return;
    this._bound = true;

    window.addEventListener('resize', function () { self.resize(); }, false);
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self.resize(); }, 120);
    }, false);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        self.running = false;
      } else if (self.core && !self.lost) {
        self.dirty = true;
        self.start();
      }
    }, false);

    this.canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.lost = true;
      self.running = false;
      if (self.onContextLost) self.onContextLost();
    }, false);

    this.canvas.addEventListener('webglcontextrestored', function () {
      self.core = null;
      self.init();
    }, false);
  };

  Engine.prototype.resize = function () {
    var c = this.canvas;
    var w = c.clientWidth;
    var h = c.clientHeight;
    if (!w || !h || !this.core) return;
    var dpr = Math.min(window.devicePixelRatio || 1, this._degraded ? 1 : 1.5);
    var maxPx = 1800000;
    if (w * h * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (w * h)));
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);

    var vw = Math.min(w, h * 0.75);
    var vh = vw / 0.75;
    var vx = (w - vw) / 2;
    var vy = (h - vh) / 2;

    this.core.dpr = dpr;
    this.core.cssW = w;
    this.core.cssH = h;
    this.core.viewCss = { x: vx, y: vy, w: vw, h: vh };
    this.core.viewport = {
      x: Math.round(vx * dpr),
      y: Math.round(vy * dpr),
      w: Math.round(vw * dpr),
      h: Math.round(vh * dpr)
    };
    this.dirty = true;
  };

  Engine.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    requestAnimationFrame(this.loopBound);
  };

  Engine.prototype.loop = function () {
    if (!this.running) return;
    requestAnimationFrame(this.loopBound);
    if (!this.core || this.lost) return;
    if (this.dirty) {
      this.dirty = false;
      this.drawNow();
    }
  };

  Engine.prototype.drawNow = function () {
    var perf = window.performance;
    var t0 = perf && perf.now ? perf.now() : Date.now();
    drawScene(this.core, this.state);
    var cost = (perf && perf.now ? perf.now() : Date.now()) - t0;
    this._cost = this._cost ? this._cost * 0.75 + cost * 0.25 : cost;
    if (!this._degraded && this._cost > 26) {
      this._degraded = true;
      this.resize();
    }
  };

  Engine.prototype.setCamera = function (patch) {
    var c = this.state.camera;
    if (patch.frame) c.frame = patch.frame;
    if (patch.lens) c.lens = patch.lens;
    if (patch.pitch !== undefined) c.pitch = patch.pitch * DEG;
    if (patch.zoom !== undefined) c.zoom = Math.max(0.55, Math.min(2.2, patch.zoom));
    this.dirty = true;
  };

  Engine.prototype.setLight = function (patch) {
    var l = this.state.light;
    if (patch.az !== undefined) l.az = patch.az;
    if (patch.el !== undefined) l.el = patch.el;
    if (patch.intensity !== undefined) l.intensity = patch.intensity;
    if (patch.rim !== undefined) l.rim = patch.rim;
    this.dirty = true;
  };

  Engine.prototype.setScene = function (patch) {
    if (patch.bg) this.state.scene.bg = patch.bg;
    if (patch.prop) this.state.scene.prop = patch.prop;
    this.dirty = true;
  };

  Engine.prototype.setSelected = function (id) {
    this.state.selected = id;
    this.dirty = true;
  };

  Engine.prototype.applyPose = function (def) {
    resetPoseTo(this.state, def);
    this.state.selected = null;
    this.dirty = true;
  };

  Engine.prototype.resetPose = function () {
    resetPoseTo(this.state, null);
    this.state.selected = null;
    this.dirty = true;
  };

  Engine.prototype.orbit = function (dx, dy) {
    var c = this.state.camera;
    c.yaw += dx * 0.0075;
    c.pitch = Math.max(-24 * DEG, Math.min(62 * DEG, c.pitch + dy * 0.0055));
    this.dirty = true;
  };

  Engine.prototype.zoomBy = function (scale) {
    var c = this.state.camera;
    c.zoom = Math.max(0.55, Math.min(2.2, c.zoom / scale));
    this.dirty = true;
  };

  Engine.prototype.rotateBone = function (id, dx, dy) {
    var bone = BONE_MAP[id];
    if (!bone || !this.core) return;
    var world = evaluateRig(this.state.pose);
    var Rw = m3Mul(
      m3AxisAngle([0, 1, 0], dx * 0.0075),
      m3AxisAngle([this.core.view[0], this.core.view[4], this.core.view[8]], dy * 0.0075)
    );
    var Rp = bone.parent ? m3FromMat4(world[bone.parent]) : IDENT3;
    var cur = this.state.pose.local[id] || IDENT3;
    this.state.pose.local[id] = m3Orthonormalize(
      m3Mul(m3Transpose(Rp), m3Mul(Rw, m3Mul(Rp, cur)))
    );
    this.dirty = true;
  };

  Engine.prototype.pick = function (cssX, cssY) {
    if (!this.core) return null;
    var world = this.core.lastWorld || evaluateRig(this.state.pose);
    var vp = this.core.vp;
    if (!vp) return null;
    var r = this.core.viewCss;
    var best = null;
    var bestD = 27;
    for (var i = 0; i < BONES.length; i++) {
      var b = BONES[i];
      if (!b.pick) continue;
      var p = translationOf(world[b.id]);
      var cx = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
      var cy = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
      var cw = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (cw <= 0) continue;
      var ndcX = cx / cw;
      var ndcY = cy / cw;
      var sx = r.x + (ndcX * 0.5 + 0.5) * r.w;
      var sy = r.y + (0.5 - ndcY * 0.5) * r.h;
      var d = Math.sqrt((sx - cssX) * (sx - cssX) + (sy - cssY) * (sy - cssY));
      if (d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
    return best;
  };

  Engine.prototype.exportDataUrl = function (w, h) {
    if (!this.core) return null;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var core = null;
    try {
      core = createCore(canvas);
      if (!core) return null;
      core.viewport = { x: 0, y: 0, w: w, h: h };
      core.viewCss = { x: 0, y: 0, w: w, h: h };
      core.cssW = w;
      core.cssH = h;
      drawScene(core, this.state, true);
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    } finally {
      if (core) core.dispose();
    }
  };

  Engine.prototype.destroy = function () {
    this.running = false;
    if (this.core) this.core.dispose();
    this.core = null;
  };

  global.PoseEngine = {
    create: function (canvas) { return new Engine(canvas); },
    frames: FRAMES
  };
})(window);
