const express = require('express');

const router = express.Router();

const BASIC_AUTH_REALM = 'Basic realm="Emissao NFSe Treinamento"';
const EXPECTED_USERNAME = '01.317.277/0001-05';
const EXPECTED_PASSWORD = 'Ipm@2025';
const XML_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<retorno>
    <mensagem>
        <codigo>00001 - Sucesso</codigo>
    </mensagem>
    <nfse>
        <identificador>1000798323</identificador>
        <nf>
            <numero_nfse>1082825</numero_nfse>
            <serie_nfse>1</serie_nfse>
            <data_nfse>29/10/2025</data_nfse>
            <data_fato>29/10/2025</data_fato>
            <hora_nfse>16:46:18</hora_nfse>
            <situacao_codigo_nfse>1</situacao_codigo_nfse>
            <situacao_descricao_nfse>Emitida</situacao_descricao_nfse>
            <link_nfse>https://itapoa.atende.net/autoatendimento/servicos/consulta-de-autenticidade-de-nota-fiscal-eletronica-nfse/detalhar/1/identificador/9985291025164618400013172772025108377347</link_nfse>
            <cod_verificador_autenticidade>9985291025164618400013172772025108377347</cod_verificador_autenticidade>
            <valor_total>116,00</valor_total>
            <valor_desconto>0,00</valor_desconto>
            <valor_ir>0,00</valor_ir>
            <valor_inss>0,00</valor_inss>
            <valor_contribuicao_social>0,00</valor_contribuicao_social>
            <valor_rps>0,00</valor_rps>
            <valor_pis>0,00</valor_pis>
            <valor_cofins>0,00</valor_cofins>
            <observacao>Draft: 1000798323 | 2523718358 | IMPO POR BL</observacao>
        </nf>
        <prestador>
            <cpfcnpj>01317277000105</cpfcnpj>
            <cidade>9985</cidade>
        </prestador>
        <tomador>
            <tipo>J</tipo>
            <cpfcnpj>09291672000178</cpfcnpj>
            <ie></ie>
            <sobrenome_nome_fantasia>0</sobrenome_nome_fantasia>
            <nome_razao_social>PARTER TRADING IMPORTADORA E EXPORTADORA LTDA.</nome_razao_social>
            <numero_residencia>134</numero_residencia>
            <complemento>ANDAR 6 </complemento>
            <ponto_referencia>0</ponto_referencia>
            <pais>Brasil</pais>
            <siglaPais>BR</siglaPais>
            <codigoIbgePais>1058</codigoIbgePais>
            <estado>SC</estado>
            <cidade>8179</cidade>
            <logradouro>ACESSO alameda rodovia r evaristo da veiga</logradouro>
            <bairro>GLORIA</bairro>
            <cep>89216215</cep>
            <ddd_fone_residencial>0</ddd_fone_residencial>
            <ddd_fone_comercial>0</ddd_fone_comercial>
            <fone_residencial></fone_residencial>
            <fone_comercial>0</fone_comercial>
            <ddd_fax>0</ddd_fax>
            <fone_fax>0</fone_fax>
            <email>MARIA.OLIVEIRA@PARTER.COM.BR</email>
        </tomador>
        <itens>
            <lista>
                <codigo_local_prestacao_servico>9985</codigo_local_prestacao_servico>
                <codigo_atividade>523110200</codigo_atividade>
                <codigo_item_lista_servico>1104</codigo_item_lista_servico>
                <descritivo>Servicos de porto discriminados abaixo</descritivo>
                <aliquota_item_lista_servico>3,0000</aliquota_item_lista_servico>
                <situacao_tributaria>0</situacao_tributaria>
                <valor_tributavel>116,00</valor_tributavel>
                <valor_deducao>0,00</valor_deducao>
                <valor_issrf>0,00</valor_issrf>
                <tributa_municipio_prestador>S</tributa_municipio_prestador>
            </lista>
        </itens>
    </nfse>
</retorno>`;

const rawBodyParser = express.raw({
    type: () => true,
    limit: '10mb',
});

router.post('/', rawBodyParser, (req, res) => {
    const authorizationHeader = req.get('authorization') || '';
    const match = authorizationHeader.match(/^Basic\s+(.+)/i);

    if (!match) {
        return res
            .status(401)
            .set('WWW-Authenticate', BASIC_AUTH_REALM)
            .send('Unauthorized');
    }

    let decoded = '';
    try {
        decoded = Buffer.from(match[1], 'base64').toString('utf8');
    } catch (error) {
        return res
            .status(401)
            .set('WWW-Authenticate', BASIC_AUTH_REALM)
            .send('Unauthorized');
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
        return res
            .status(401)
            .set('WWW-Authenticate', BASIC_AUTH_REALM)
            .send('Unauthorized');
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    const isAuthorized =
        username === EXPECTED_USERNAME && password === EXPECTED_PASSWORD;

    if (!isAuthorized) {
        return res
            .status(401)
            .set('WWW-Authenticate', BASIC_AUTH_REALM)
            .send('Unauthorized');
    }

    const contentType = (req.get('content-type') || '').toLowerCase();
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({
            error: 'Request must be multipart/form-data with the f1 file.',
        });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return res.status(400).json({ error: 'Multipart payload is required.' });
    }

    const bodyString = rawBody.toString('utf8');
    if (!bodyString.includes('name="f1"')) {
        return res.status(400).json({
            error: 'Missing file field "f1" in multipart payload.',
        });
    }

    return res
        .status(200)
        .type('application/xml; charset=utf-8')
        .send(XML_RESPONSE);
});

module.exports = router;
