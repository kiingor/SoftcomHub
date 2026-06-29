/**
 * SoftcomHub Widget — bolha flutuante de chat.
 *
 * Uso (só isto, sem div):
 *   <script src="https://seu-dominio.com/embed-widget.js?key=sk_widget_xxxxx"></script>
 *
 * Cria um botão flutuante no canto inferior direito que abre/fecha o chat.
 */
(function () {
  // Descobre a key e a origem a partir da própria tag <script>
  var self =
    document.currentScript ||
    (function () {
      var ss = document.getElementsByTagName('script')
      for (var i = ss.length - 1; i >= 0; i--) {
        if (ss[i].src && ss[i].src.indexOf('embed-widget.js') !== -1) return ss[i]
      }
      return null
    })()

  if (!self) return
  var url = new URL(self.src)
  var widgetKey = url.searchParams.get('key')
  var baseUrl = url.origin

  if (!widgetKey) {
    console.error('SoftcomHub Widget: key não fornecida na URL do script')
    return
  }

  // Evita carregar duas vezes
  if (window.__softcomWidget) return
  window.__softcomWidget = true

  var PRIMARY = '#EE6D1D'

  var iconChat =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  var iconClose =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  // Painel do chat (iframe)
  var panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;bottom:92px;right:20px;width:380px;max-width:calc(100vw - 40px);' +
    'height:600px;max-height:calc(100vh - 120px);z-index:2147483000;border-radius:16px;' +
    'overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.18);background:#fff;opacity:0;' +
    'transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .2s,transform .2s;'

  var iframe = document.createElement('iframe')
  iframe.src = baseUrl + '/widget/chat?key=' + encodeURIComponent(widgetKey)
  iframe.title = 'Chat de atendimento'
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;'
  panel.appendChild(iframe)

  // Botão flutuante (bolha)
  var btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Abrir chat')
  btn.innerHTML = iconChat
  btn.style.cssText =
    'position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;border:none;' +
    'cursor:pointer;background:' + PRIMARY + ';box-shadow:0 6px 20px rgba(238,109,29,.45);' +
    'z-index:2147483001;display:flex;align-items:center;justify-content:center;transition:transform .15s;'

  var aberto = false
  function setAberto(v) {
    aberto = v
    if (aberto) {
      panel.style.opacity = '1'
      panel.style.transform = 'translateY(0) scale(1)'
      panel.style.pointerEvents = 'auto'
      btn.innerHTML = iconClose
      btn.setAttribute('aria-label', 'Fechar chat')
    } else {
      panel.style.opacity = '0'
      panel.style.transform = 'translateY(12px) scale(.98)'
      panel.style.pointerEvents = 'none'
      btn.innerHTML = iconChat
      btn.setAttribute('aria-label', 'Abrir chat')
    }
  }

  btn.addEventListener('click', function () {
    setAberto(!aberto)
  })
  btn.addEventListener('mouseenter', function () {
    btn.style.transform = 'scale(1.06)'
  })
  btn.addEventListener('mouseleave', function () {
    btn.style.transform = 'scale(1)'
  })

  // Em telas pequenas, o painel ocupa a tela toda
  function ajustar() {
    if (window.innerWidth < 480) {
      panel.style.width = '100vw'
      panel.style.height = '100vh'
      panel.style.maxHeight = '100vh'
      panel.style.bottom = '0'
      panel.style.right = '0'
      panel.style.borderRadius = '0'
    } else {
      panel.style.width = '380px'
      panel.style.height = '600px'
      panel.style.maxHeight = 'calc(100vh - 120px)'
      panel.style.bottom = '92px'
      panel.style.right = '20px'
      panel.style.borderRadius = '16px'
    }
  }
  window.addEventListener('resize', ajustar)

  function montar() {
    document.body.appendChild(panel)
    document.body.appendChild(btn)
    ajustar()
  }
  if (document.body) montar()
  else window.addEventListener('DOMContentLoaded', montar)
})()
