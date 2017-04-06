let TermCanvas = require('terminal-canvas');
let termKit = require('terminal-kit');
let term = termKit.terminal;

function charCode(char) {
  return char.charCodeAt(0);
}

function isAlpha(char) {
  let c = charCode(this._char);
  return (c >= charCode('a') && c <= charCode('z'))
    || (c >= charCode('A') && c <= charCode('Z'));
}

class Location {
  constructor(c, l) {
    this._char = c;
    this._line = l;
  }

  moveTo(c, l) {
    this._char = c;
    this._line = l;
  }

  compare(l) {
    if (this._line < l._line) {
      return -1;
    } else if (this._line > l._line) {
      return 1;
    } else {
      if (this._char < l._char) {
        return -1;
      } else if (this._char > l._char) {
        return 1;
      } else {
        return 0;
      }
    }
  }

  clone() {
    return new Location(this._char, this._line);
  }
}

class Range {
  constructor(begLoc, endLoc) {
    if (begLoc.compare(endLoc)  >= 0) {
      this._beg = begLoc;
      this._end = endLoc;
    } else {
      this._beg = endLoc;
      this._end = begLoc;
    }
  }

  chars(buffer) {
    // TODO
  }

  charsLen(buffer) {
    return this.chars(buffer).length;
  }
}

class Hooks {
  constructor() {
    this._hooks = {};
  }

  hook(name, cb) {
    _hooks[name] = _hooks[name] || [];
    _hooks[name].push(cb);
  }

  trigger(name, ...args) {
    let hooks = this._hooks[name] || [];
    hooks.forEach(cb => cb(...args));
  }
}

class Styles {
  constructor() {
    this._styles = {
      default: 0,
    };
  }

  get(name) {
    return this._styles[name] || this._styles['default'];
  }

  set(name, value) {
    let parts = value.split(',');
    this._styles[name] = termKit.ScreenBuffer.object2attr({
      color: parts[0] && parts[0].length > 0 ? parts[0] : undefined,
      bgColor: parts[1] && parts[1].length > 0 ? parts[1] : undefined,
      bold: parts[2] === 'b',
    });
  }
}

class KeyStroke {
  constructor(rep) {
    this._s_alt = false;
    this._s_ctrl = false;
    this._s_shift = false;
    this._special = null;
    this._char = null;

    let parts = rep.split('-');
    if (parts[0] === 'C') {
      parts = parts.slice(1);
      this._s_ctrl = true;
    }
    if (parts[0] === 'A') {
      parts = parts.slice(1);
      this._s_alt = true;
    }
    if (parts[0] === 'S') {
      parts = parts.slice(1);
      this._s_shift = true;
    }

    if (parts[0].length === 1) {
      this._char = parts[0];
    } else {
      this._special = parts[0];
    }
  }

  setSpecial(special) {
    this._special = special;
    this._char = null;
    return this;
  }

  setChar(char) {
    this._char = char;
    this._special = null;
    return this;
  }

  matches(k) {
    if (k._special === '$any' || this._special === '$any') {
      return true;
    }
    if (k._special === '$alpha') {
      return this._char && isAlpha(this._char);
    }
    if (this._special === '$alpha') {
      return k._char && isAlpha(k._char);
    }
    return (
      this._s_ctrl === k._s_ctrl &&
      this._s_alt === k._s_alt &&
      this._s_shift === k._s_shift &&
      this._special === k._special &&
      this._char === k._char
    );
  }
}

KeyStroke.fromEvent = function(k) {
  if (k.length == 1) {
    return new KeyStroke(k)
  }

  let keyStroke = new KeyStroke('\0');
  let parts = k.split('_');
  // Order is important here
  if (parts[0] === 'CTRL') {
    parts = parts.slice(1);
    keyStroke._s_ctrl = true;
  }
  if (parts[0] === 'ALT') {
    parts = parts.slice(1);
    keyStroke._s_alt = true;
  }
  if (parts[0] === 'SHIFT') {
    parts = parts.slice(1);
    keyStroke._s_shift = true;
  }

  let rest = parts.join('_');
  if (rest === 'ESCAPE') {
    return keyStroke.setSpecial('ESC');
  } else if (rest === 'ENTER') {
    return keyStroke.setSpecial('RET');
  } else if (rest === 'BACKSPACE') {
    return keyStroke.setSpecial('BAK');
  } else if (rest === 'TAB') {
    return keyStroke.setSpecial('TAB');
  } else if (rest === 'DELETE') {
    return keyStroke.setSpecial('DEL');
  }

  return keyStroke.setChar(rest);
};

class Key {
  constructor(rep) {
    this._keys = [];
    let parts = rep.split(' ');
    for (let i in parts) {
      this._keys.push(new KeyStroke(parts[i]));
    }
  }

  append(ks) {
    this._keys.push(ks);
  }

  matchesTail(k) {
    // TODO
  }
}


class Mode {
  constructor(name) {
    this._name = name;
    this._bindings = [];
  }

  bind(key, fn) {
    this._bindings.push({key, fn});
  }

  handle(key) {
    let match = null;
    for (let i in this._bindings) {
      let binding = this._bindings[i];
      if (binding.key.matches(key) && (match == null || match.len() < binding.key.len())) {
        match = binding.key;
      }
    }
    return match;
  }
}

class Modes {
  constructor() {
    this._modes = [];
  }

  create(name) {
    this._modes.push(new Mode(name));
  }

  find(name) {
    for (let i in this._modes) {
      if (this._modes[i].name === name) {
        return this._modes[i];
      }
    }
    return null;
  }
}

class Buffer {
  constructor() {
    this._data = [];
    this._modes = [];
  }
}

class Buffers {
  constructor() {
    this._buffers = [];
  }

  add(b) {
    this._buffers.push(b);
  }

  find(name) {
    for (let i in this._buffers) {
      if (this._buffers[i].name === name) {
        return this._buffers[i];
      }
    }
    return null;
  }

  remove(name) {
    for (let i in this._buffers) {
      if (this._buffers[i].name === name) {
        this._buffers.splice(i, 1);
        return;
      }
    }
  }
}

class Config {
  constructor() {
    this._values = {};
  }
}

class Editor {
  constructor() {
    this.modes = new Modes();
    this.hooks = new Hooks();
    this.styles = new Styles();
    this.config = new Config();
    this.buffers = new Buffers();

    this._mode = 'normal';
    this._cursor = new Location(0, 0);
  }

  clear() {
    let h = term.height;
    let w = term.width;
    this.screen.foreground('white');
    this.screen.background(false);
    for (let l = 0; l < h; l++) {
      for (let c = 0; c < w; c++) {
        this.screen.moveTo(c, l);
        this.screen.write(' ');
      }
    }
  }

  render() {
    this.clear();
    this.screen.moveTo(0, 0);
    this.screen.foreground('white');
    this.screen.background(false);
    this.screen.write('$');
    this.screen.flush();
  }

  handle(keyStroke) {
    this.stop();
    if (keyStroke._s_ctrl && keyStroke._char === 'q') {
      this.stop();
    }
  }

  start() {
    let self = this;
    this.screen = new TermCanvas();
    this.screen.hideCursor();
    this.clear();
    this.screen.flush();
    term.grabInput(true);
    term.on('key', function(name, matches, data) {
      self.handle(KeyStroke.fromEvent(name));
    });
    this.render();
  }

  stop() {
    term.grabInput(false);
    process.stdout.write('\u001b[?25h');
    process.stdout.write('\u001bc');
    process.exit(0);
  }
}

let E = new Editor();
global.E = E;
E.start();

process.on('uncaughtException', function(err) {
  E.stop();
  console.error(err);
});
