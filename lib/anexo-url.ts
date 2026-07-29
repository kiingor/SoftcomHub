/**
 * Como abrir o anexo de uma mensagem.
 *
 * O atributo `download` do HTML só vale para a mesma origem, e os anexos vivem
 * em outro domínio (Supabase Storage e Vercel Blob). Quem decide entre baixar e
 * exibir é o `Content-Disposition` que o provedor devolve — por isso o pedido
 * precisa ir na URL. Sem isso o navegador exibe o arquivo, e num link sem
 * `target` o PDF substituía a tela de atendimento.
 */

export function getAnexoExtension(url: string): string {
  return (url.toLowerCase().split('?')[0].split('.').pop() || '').trim()
}

/**
 * Só o PDF abre para leitura numa guia — é o documento que o atendente precisa
 * consultar em paralelo ao chamado.
 *
 * A lista é deliberadamente curta. Num levantamento de 6.000 anexos em
 * 29/07/2026 havia 263 PDFs, nenhum `.xml` ou `.json`, e os dois únicos `.txt`
 * eram senhas de certificado digital (`Senha_certificado_*.txt`) — renderizar
 * isso numa aba deixaria a credencial na tela e no histórico do navegador.
 * Baixar é o tratamento certo para eles.
 */
export function isViewableInBrowser(ext: string, mediaType?: string | null): boolean {
  return mediaType === 'application/pdf' || ext === 'pdf'
}

export function getFileDownloadUrl(url: string): string {
  try {
    const downloadUrl = new URL(url)

    if (downloadUrl.hostname.endsWith('.blob.vercel-storage.com')) {
      downloadUrl.searchParams.set('download', '1')
    } else if (downloadUrl.pathname.includes('/storage/v1/object/public/')) {
      // Supabase Storage — onde está a maior parte dos anexos. Aceita `?download`
      // sem valor para responder com `Content-Disposition: attachment`.
      downloadUrl.searchParams.set('download', '')
    }

    return downloadUrl.toString()
  } catch {
    return url
  }
}
