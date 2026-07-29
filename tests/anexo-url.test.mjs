import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAnexoExtension,
  getFileDownloadUrl,
  isViewableInBrowser,
} from '../lib/anexo-url.ts'

// URLs reais dos anexos (amostra de 29/07/2026): 806 no Supabase Storage,
// 186 no Vercel Blob.
const SUPABASE_PDF = 'https://wuyqsnmbhswjpylrpyhk.supabase.co/storage/v1/object/public/SoftcomHub-file/2026/07/29/Documento.pdf'
const BLOB_PDF = 'https://gdsdt70kmtmdtznk.public.blob.vercel-storage.com/workdesk/1785335723211-32ttvo.pdf'

test('pede attachment ao Supabase Storage, onde está a maior parte dos anexos', () => {
  // Sem esse parâmetro o navegador exibia o arquivo, e o link sem target
  // substituía a tela de atendimento.
  const url = new URL(getFileDownloadUrl(SUPABASE_PDF.replace('.pdf', '.zip')))

  assert.ok(url.searchParams.has('download'))
})

test('mantém o parâmetro que o Vercel Blob espera', () => {
  const url = new URL(getFileDownloadUrl(BLOB_PDF.replace('.pdf', '.zip')))

  assert.equal(url.searchParams.get('download'), '1')
})

test('não inventa parâmetro em provedor desconhecido', () => {
  const original = 'https://cdn.discordapp.com/attachments/1/2/arquivo.zip'

  assert.equal(getFileDownloadUrl(original), original)
})

test('devolve a URL intacta quando ela não é analisável', () => {
  assert.equal(getFileDownloadUrl('nao é uma url'), 'nao é uma url')
})

test('preserva a query que já existia na URL', () => {
  const url = new URL(getFileDownloadUrl(`${SUPABASE_PDF}?token=abc`))

  assert.equal(url.searchParams.get('token'), 'abc')
  assert.ok(url.searchParams.has('download'))
})

test('PDF é para abrir na guia, não para baixar', () => {
  assert.equal(isViewableInBrowser('pdf'), true)
  assert.equal(isViewableInBrowser('', 'application/pdf'), true)
})

test('senha de certificado em .txt baixa, não vai para a tela', () => {
  // Os dois únicos .txt do sistema em 29/07/2026 eram
  // `Senha_certificado_*.txt`. Abrir numa guia deixaria a credencial exposta na
  // tela e no histórico do navegador.
  assert.equal(isViewableInBrowser('txt', 'text/plain'), false)
})

test('todo o resto continua sendo download', () => {
  for (const ext of ['zip', 'docx', 'xlsx', 'p12', 'pfx', 'rar', 'xml', 'json']) {
    assert.equal(isViewableInBrowser(ext), false, `${ext} não deveria abrir na guia`)
  }
})

test('lê a extensão ignorando a query string', () => {
  assert.equal(getAnexoExtension(`${SUPABASE_PDF}?download=&t=1`), 'pdf')
  assert.equal(getAnexoExtension('https://exemplo.test/ARQUIVO.PDF'), 'pdf')
})
