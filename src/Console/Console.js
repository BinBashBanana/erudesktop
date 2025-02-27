import Tool from '../DevTools/Tool'
import {
  noop,
  $,
  Emitter,
  uncaught,
  escapeRegExp,
  trim,
  upperFirst,
  isHidden,
  lowerCase,
  isNull,
} from '../lib/util'
import evalCss from '../lib/evalCss'
import emitter from '../lib/emitter'
import Settings from '../Settings/Settings'
import LunaConsole from 'luna-console'

uncaught.start()

export default class Console extends Tool {
  constructor({ name = 'console' } = {}) {
    super()

    Emitter.mixin(this)

    this.name = name
    this._scale = 1

    this._registerListener()
  }
  init($el, container) {
    super.init($el)

    this._history = []
    this._historyIndex = 0

    this._container = container

    this._appendTpl()

    this._initCfg()

    this._initLogger()
    this._exposeLogger()
    this._bindEvent()
  }
  show() {
    super.show()
    this._handleShow()
  }
  overrideConsole() {
    const origConsole = (this._origConsole = {})
    const winConsole = window.console

    CONSOLE_METHOD.forEach((name) => {
      let origin = (origConsole[name] = noop)
      if (winConsole[name]) {
        origin = origConsole[name] = winConsole[name].bind(winConsole)
      }

      winConsole[name] = (...args) => {
        this[name](...args)
        origin(...args)
      }
    })

    return this
  }
  setGlobal(name, val) {
    this._logger.setGlobal(name, val)
  }
  restoreConsole() {
    if (!this._origConsole) return this

    CONSOLE_METHOD.forEach(
      (name) => (window.console[name] = this._origConsole[name])
    )
    delete this._origConsole

    return this
  }
  catchGlobalErr() {
    uncaught.addListener(this._handleErr)

    return this
  }
  ignoreGlobalErr() {
    uncaught.rmListener(this._handleErr)

    return this
  }
  destroy() {
    this._logger.destroy()
    super.destroy()

    this._container.off('show', this._handleShow)

    if (this._style) {
      evalCss.remove(this._style)
    }
    this.ignoreGlobalErr()
    this.restoreConsole()
    this._unregisterListener()
    this._rmCfg()
  }
  _handleShow = () => {
    if (isHidden(this._$el.get(0))) return
    this._logger.renderViewport()
  }
  _handleErr = (err) => {
    this._logger.error(err)
  }
  _enableJsExecution(enabled) {
    const $el = this._$el
    const $container = $el.find('.eruda-console-container')
    const $jsInput = $el.find('.eruda-js-input')

    if (enabled) {
      $jsInput.show()
      $container.rmClass('eruda-js-input-hidden')
    } else {
      $jsInput.hide()
      $container.addClass('eruda-js-input-hidden')
    }
  }
  _registerListener() {
    this._scaleListener = (scale) => (this._scale = scale)

    emitter.on(emitter.SCALE, this._scaleListener)
  }
  _unregisterListener() {
    emitter.off(emitter.SCALE, this._scaleListener)
  }
  _appendTpl() {
    const $el = this._$el

    this._style = evalCss(require('./Console.scss'))
    $el.append(require('./Console.hbs')())

    const _$inputContainerMain = $el.find('.eruda-console-main')
    const _$inputContainer = _$inputContainerMain.find('.eruda-js-input')
    const _$input = _$inputContainer.find('.eruda-js-text-input')

    Object.assign(this, {
      _$control: $el.find('.eruda-control'),
      _$logs: $el.find('.eruda-logs-container'),
      _$inputContainerMain,
      _$inputContainer,
      _$input,
      _$searchKeyword: $el.find('.eruda-search-keyword'),
    })
  }
  _initLogger() {
    const cfg = this.config
    let maxLogNum = cfg.get('maxLogNum')
    maxLogNum = maxLogNum === 'infinite' ? 0 : +maxLogNum

    const $filter = this._$control.find('.eruda-filter')
    const logger = new LunaConsole(this._$logs.get(0), {
      asyncRender: cfg.get('asyncRender'),
      maxNum: maxLogNum,
      showHeader: cfg.get('displayExtraInfo'),
      unenumerable: cfg.get('displayUnenumerable'),
      accessGetter: cfg.get('displayGetterVal'),
      lazyEvaluation: cfg.get('lazyEvaluation'),
    })

    logger.on('optionChange', (name, filter) => {
      if (name !== 'filter') {
        return
      }
      $filter.each(function () {
        const $this = $(this)
        const isMatch = $this.data('filter') === filter

        $this[isMatch ? 'addClass' : 'rmClass']('eruda-active')
      })
    })

    if (cfg.get('overrideConsole')) this.overrideConsole()

    this._logger = logger
  }
  _exposeLogger() {
    const logger = this._logger
    const methods = ['filter', 'html'].concat(CONSOLE_METHOD)

    methods.forEach(
      (name) =>
        (this[name] = (...args) => {
          logger[name](...args)
          this.emit(name, ...args)

          return this
        })
    )
  }
  _bindEvent() {
    const container = this._container
    const $input = this._$input
    const $control = this._$control
    const $searchKeyword = this._$searchKeyword

    const logger = this._logger
    const config = this.config

    $control
      .on('click', '.eruda-clear-console', () => logger.clear(true))
      .on('click', '.eruda-filter', function () {
        $searchKeyword.text('')
        logger.setOption('filter', $(this).data('filter'))
      })
      .on('click', '.eruda-search', () => {
        const filter = prompt('Filter')
        if (isNull(filter)) return
        $searchKeyword.text(filter)
        if (trim(filter) === '') {
          logger.setOption('filter', 'all')
          return
        }
        logger.setOption('filter', new RegExp(escapeRegExp(lowerCase(filter))))
      })

    $input[0].addEventListener('keydown', (e) => {
      if (!e.shiftKey && e.code == 'Enter') {
        e.preventDefault()

        const jsInput = $input[0].textContent.trim()
        if (jsInput === '') return

        this._history.unshift(jsInput)
        this._historyIndex = 0

        logger.evaluate(jsInput)
        $input[0].textContent = ''
      } else if (!e.shiftKey && ['ArrowUp', 'ArrowDown'].includes(e.code)) {
        const newIndex = this._historyIndex + (e.code == 'ArrowUp' ? 1 : -1)
        if (newIndex >= 0 && newIndex <= this._history.length) {
          this._historyIndex = newIndex
          $input[0].textContent = newIndex == 0 ? '' : this._history[newIndex - 1]
        }
      }

      this._$inputContainerMain[0].scrollTo({top: this._$inputContainerMain[0].scrollHeight})
    })

    this._$inputContainerMain[0].addEventListener('click', (e) => {
      if (e.target == this._$inputContainerMain[0]) $input[0].focus()
    })

    logger.on('insert', (log) => {
      const autoShow = log.type === 'error' && config.get('displayIfErr')

      if (autoShow) container.showTool('console').show()
    })

    container.on('show', this._handleShow)
  }
  _rmCfg() {
    const cfg = this.config

    const settings = this._container.get('settings')
    if (!settings) return

    settings
      .remove(cfg, 'asyncRender')
      .remove(cfg, 'jsExecution')
      .remove(cfg, 'catchGlobalErr')
      .remove(cfg, 'overrideConsole')
      .remove(cfg, 'displayExtraInfo')
      .remove(cfg, 'displayUnenumerable')
      .remove(cfg, 'displayGetterVal')
      .remove(cfg, 'lazyEvaluation')
      .remove(cfg, 'displayIfErr')
      .remove(cfg, 'maxLogNum')
      .remove(upperFirst(this.name))
  }
  _initCfg() {
    const container = this._container

    const cfg = (this.config = Settings.createCfg(this.name, {
      asyncRender: true,
      catchGlobalErr: true,
      jsExecution: true,
      overrideConsole: true,
      displayExtraInfo: false,
      displayUnenumerable: true,
      displayGetterVal: true,
      lazyEvaluation: true,
      displayIfErr: false,
      maxLogNum: 'infinite',
    }))

    this._enableJsExecution(cfg.get('jsExecution'))
    if (cfg.get('catchGlobalErr')) this.catchGlobalErr()

    cfg.on('change', (key, val) => {
      const logger = this._logger
      switch (key) {
        case 'asyncRender':
          return logger.setOption('asyncRender', val)
        case 'jsExecution':
          return this._enableJsExecution(val)
        case 'catchGlobalErr':
          return val ? this.catchGlobalErr() : this.ignoreGlobalErr()
        case 'overrideConsole':
          return val ? this.overrideConsole() : this.restoreConsole()
        case 'maxLogNum':
          return logger.setOption('maxNum', val === 'infinite' ? 0 : +val)
        case 'displayExtraInfo':
          return logger.setOption('showHeader', val)
        case 'displayUnenumerable':
          return logger.setOption('unenumerable', val)
        case 'displayGetterVal':
          return logger.setOption('accessGetter', val)
        case 'lazyEvaluation':
          return logger.setOption('lazyEvaluation', val)
      }
    })

    const settings = container.get('settings')
    if (!settings) return

    settings
      .text(upperFirst(this.name))
      .switch(cfg, 'asyncRender', 'Asynchronous Rendering')
      .switch(cfg, 'jsExecution', 'Enable JavaScript Execution')
      .switch(cfg, 'catchGlobalErr', 'Catch Global Errors')
      .switch(cfg, 'overrideConsole', 'Override Console')
      .switch(cfg, 'displayIfErr', 'Auto Display If Error Occurs')
      .switch(cfg, 'displayExtraInfo', 'Display Extra Information')
      .switch(cfg, 'displayUnenumerable', 'Display Unenumerable Properties')
      .switch(cfg, 'displayGetterVal', 'Access Getter Value')
      .switch(cfg, 'lazyEvaluation', 'Lazy Evaluation')
      .select(cfg, 'maxLogNum', 'Max Log Number', [
        'infinite',
        '250',
        '125',
        '100',
        '50',
        '10',
      ])
      .separator()
  }
}

const CONSOLE_METHOD = [
  'log',
  'error',
  'info',
  'warn',
  'dir',
  'time',
  'timeLog',
  'timeEnd',
  'clear',
  'table',
  'assert',
  'count',
  'countReset',
  'debug',
  'group',
  'groupCollapsed',
  'groupEnd',
]
