// Seeds one demo user linked to two demo companies (so the company switcher
// has something to switch between), each with a set of bank_transactions
// rows and a starter chat thread. Safe to re-run: user/company/user_company/
// chat_thread rows use upserts or existence checks, while bank_transactions
// is deleted and reinserted per company each run (see comment below).
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const DEMO_EMAIL = "joaocarloscoliveira@gmail.com";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Joao Oliveira";

type BankTxRow = [string, string, string, string, number, string, string, string, string, number];
// [account_code, account_name, account_class, snc_class, parent_account (null = top-level)]
type ChartOfAccountsRow = [string, string, string, string, string | null];
// [third_party_id (null = no third party, e.g. a bank loan), contract_ref, title, start_date, end_date, monthly_amount, full_text, source_document]
type ContractRow = [number | null, string, string, string, string, number, string, number];
// [document_type, file_name, entity_id (null = no linked entity), date]
type DocumentRow = [string, string, number | null, string];
// [name, position, gross_monthly_salary, active]
type EmployeeRow = [string, string, number, boolean];

interface CompanySeed {
  name: string;
  threadTitle: string;
  bankTransactions: BankTxRow[];
  chartOfAccounts?: ChartOfAccountsRow[];
  contracts?: ContractRow[];
  documents?: DocumentRow[];
  employees?: EmployeeRow[];
}

const COMPANIES: CompanySeed[] = [
  {
    name: "Metalúrgica Aurora, Lda",
    threadTitle: "Cash Shortfall Analysis for Contracts and Invoices",
    bankTransactions: [
      ["2025-11-28", "2025-11-28", "2025-11-28", "TRF Predial Costa Filhos Renda 11/2025", -850, "PT50 0365 4145 8685 0142 9401", "1", "Transferência", "1", 17650],
      ["2025-11-28", "2025-11-28", "2025-11-28", "DD MEO EMPRESAS 11/2025", -132.04, "PT50 3406 0883 5615 9514 8465", "2", "Débito Direto", "1", 17517.96],
      ["2025-11-28", "2025-11-28", "2025-11-29", "TRF Bright Ideas Honorarios 11/2025", -450, "PT50 2003 7917 6936 7632 0163", "3", "Transferência", "1", 17067.96],
      ["2025-11-28", "2025-11-28", "2025-11-28", "TRF Salarios 11/2025", -5103, "N/A - folha de vencimentos", "4", "Transferência", "1", 11964.96],
      ["2025-11-28", "2025-11-28", "2025-11-28", "DD Banco Montepio Prestacao 11/2025", -715, "PT50003501230098765432109", "5", "Débito Direto", "1", 11249.96],
      ["2025-12-21", "2025-12-21", "2025-12-22", "TRF recebido Construções Ribeiro & Filhos, Lda", 7493.18, "PT50 9600 1338 9083 8637 9402", "7", "Transferência", "2", 19852.12],
      ["2026-01-02", "2026-01-02", "2026-01-02", "TRF recebido Construções Paiva, Lda", 6437.24, "PT50 8108 0132 6773 6026 0647", "11", "Transferência", "3", 26568.06],
      ["2026-01-12", "2026-01-12", "2026-01-12", "TRF recebido Metalomecânica Beira Alta, Lda", 9467.03, "PT50 8480 1845 1462 7048 2814", "13", "Transferência", "3", 41009.71],
      ["2025-12-05", "2025-12-05", "2025-12-05", "TRF recebido Ferro & Aço do Minho, Lda", 2947.84, "PT50 3763 1165 6670 1065 1333", "15", "Transferência", "2", 14197.8],
      ["2025-12-20", "2025-12-20", "2025-12-20", "TRF pago Aços do Norte, Lda", -1838.86, "PT50 9985 4353 4624 7510 7991", "18", "Transferência", "2", 12358.9],
      ["2026-01-10", "2026-01-10", "2026-01-10", "TRF pago Aços do Norte, Lda", -3301.23, "PT50 9985 4353 4624 7510 7991", "21", "Transferência", "3", 31542.68],
      ["2026-01-24", "2026-01-24", "2026-01-24", "TRF pago Aços do Norte, Lda", -5638.26, "PT50 9985 4353 4624 7510 7991", "26", "Transferência", "3", 33998.5],
      ["2025-12-28", "2025-12-28", "2025-12-28", "TRF Predial Costa Filhos Renda 12/2025", -850, "PT50 0365 4145 8685 0142 9401", "27", "Transferência", "2", 19002.12],
      ["2025-12-28", "2025-12-28", "2025-12-28", "DD MEO EMPRESAS 12/2025", -162.71, "PT50 3406 0883 5615 9514 8465", "28", "Débito Direto", "2", 18839.41],
      ["2025-12-28", "2025-12-28", "2025-12-29", "TRF Bright Ideas Honorarios 12/2025", -450, "PT50 2003 7917 6936 7632 0163", "29", "Transferência", "2", 18389.41],
      ["2025-12-28", "2025-12-28", "2025-12-28", "TRF Salarios 12/2025", -5103, "N/A - folha de vencimentos", "30", "Transferência", "2", 13286.41],
      ["2025-12-28", "2025-12-28", "2025-12-28", "DD Banco Montepio Prestacao 12/2025", -715, "PT50003501230098765432109", "31", "Débito Direto", "2", 12571.41],
      ["2026-02-17", "2026-02-17", "2026-02-18", "TRF recebido Grupo Estrutura Firme, S.A.", 10297.01, "PT50 7133 1509 8393 0103 1051", "33", "Transferência", "4", 47049.45],
      ["2026-01-08", "2026-01-08", "2026-01-08", "TRF recebido Obras Públicas do Norte, S.A.", 10717.17, "PT50 9805 0097 8820 8121 9136", "35", "Transferência", "3", 37285.18],
      ["2026-02-13", "2026-02-13", "2026-02-13", "TRF recebido Construções Ribeiro & Filhos, Lda", 5896.87, "PT50 9600 1338 9083 8637 9402", "37", "Transferência", "4", 36752.44],
      ["2025-12-29", "2025-12-29", "2025-12-29", "TRF recebido Obras Públicas do Norte, S.A.", 7559.36, "PT50 9805 0097 8820 8121 9136", "40", "Transferência", "2", 20130.77],
      ["2026-01-22", "2026-01-22", "2026-01-22", "TRF pago Metalurgia Central, S.A.", -1372.95, "PT50 5427 8498 0841 2411 8244", "43", "Transferência", "3", 39636.76],
      ["2026-01-09", "2026-01-09", "2026-01-10", "TRF pago Distribuidora de Metais Lusitana, Lda", -2441.27, "PT50 3158 6923 2260 2563 4216", "48", "Transferência", "3", 34843.91],
      ["2026-01-28", "2026-01-28", "2026-01-29", "TRF Predial Costa Filhos Renda 01/2026", -850, "PT50 0365 4145 8685 0142 9401", "49", "Transferência", "3", 37250.65],
      ["2026-01-28", "2026-01-28", "2026-01-29", "DD MEO EMPRESAS 01/2026", -127.08, "PT50 3406 0883 5615 9514 8465", "50", "Débito Direto", "3", 37123.57],
      ["2026-01-28", "2026-01-28", "2026-01-28", "TRF Bright Ideas Honorarios 01/2026", -450, "PT50 2003 7917 6936 7632 0163", "51", "Transferência", "3", 36673.57],
      ["2026-01-28", "2026-01-28", "2026-01-28", "TRF Salarios 01/2026", -5103, "N/A - folha de vencimentos", "52", "Transferência", "3", 31570.57],
      ["2026-01-28", "2026-01-28", "2026-01-28", "DD Banco Montepio Prestacao 01/2026", -715, "PT50003501230098765432109", "53", "Débito Direto", "3", 30855.57],
      ["2026-01-24", "2026-01-24", "2026-01-24", "TRF recebido Construtora Litoral, Lda", 4102.15, "PT50 7242 3884 9696 5328 7101", "56", "Transferência", "3", 38100.65],
      ["2026-03-03", "2026-03-03", "2026-03-04", "TRF recebido Obranorte, S.A.", 7555.36, "PT50 1559 4078 9618 4959 3103", "58", "Transferência", "5", 42957.58],
      ["2026-02-19", "2026-02-19", "2026-02-19", "TRF pago Distribuidora de Metais Lusitana, Lda", -3204.9, "PT50 3158 6923 2260 2563 4216", "63", "Transferência", "4", 43844.55],
      ["2026-03-10", "2026-03-10", "2026-03-11", "TRF pago Aços do Norte, Lda", -4794.45, "PT50 9985 4353 4624 7510 7991", "66", "Transferência", "5", 35219.76],
      ["2026-03-07", "2026-03-07", "2026-03-08", "TRF pago Aços do Norte, Lda", -2943.37, "PT50 9985 4353 4624 7510 7991", "69", "Transferência", "5", 40014.21],
      ["2026-02-23", "2026-02-23", "2026-02-23", "TRF pago Ferragens Ibéricas, Lda", -1173.91, "PT50 6400 5242 7868 0112 8059", "72", "Transferência", "4", 42670.64],
      ["2026-02-28", "2026-02-28", "2026-02-28", "TRF Predial Costa Filhos Renda 02/2026", -850, "PT50 0365 4145 8685 0142 9401", "73", "Transferência", "4", 41820.64],
      ["2026-02-28", "2026-02-28", "2026-02-28", "DD MEO EMPRESAS 02/2026", -150.42, "PT50 3406 0883 5615 9514 8465", "74", "Débito Direto", "4", 41670.22],
      ["2026-02-28", "2026-02-28", "2026-02-28", "TRF Bright Ideas Honorarios 02/2026", -450, "PT50 2003 7917 6936 7632 0163", "75", "Transferência", "4", 41220.22],
      ["2026-02-28", "2026-02-28", "2026-02-28", "TRF Salarios 02/2026", -5103, "N/A - folha de vencimentos", "76", "Transferência", "4", 36117.22],
      ["2026-02-28", "2026-02-28", "2026-02-28", "DD Banco Montepio Prestacao 02/2026", -715, "PT50003501230098765432109", "77", "Débito Direto", "4", 35402.22],
      ["2026-04-02", "2026-04-02", "2026-04-02", "TRF recebido Serralharia Vale do Ave, Lda", 6338.5, "PT50 5534 1928 3276 4835 0305", "79", "Transferência", "6", 48774.37],
      ["2026-04-10", "2026-04-10", "2026-04-10", "TRF recebido Ferro & Aço do Minho, Lda", 6616.82, "PT50 3763 1165 6670 1065 1333", "81", "Transferência", "6", 62527.58],
    ],
    chartOfAccounts: [
      ["1", "Meios financeiros líquidos", "Ativo", "1", null],
      ["11", "Caixa", "Ativo", "1", "1"],
      ["12", "Depósitos à ordem", "Ativo", "1", "1"],
      ["2", "Contas a receber e a pagar", "Ativo/Passivo", "2", null],
      ["21", "Clientes", "Ativo", "2", "2"],
      ["211", "Clientes c/c", "Ativo", "2", "21"],
      ["22", "Fornecedores", "Passivo", "2", "2"],
      ["221", "Fornecedores c/c", "Passivo", "2", "22"],
      ["24", "Estado e outros entes públicos", "Ativo/Passivo", "2", "2"],
      ["243", "Imposto sobre o valor acrescentado", "Ativo/Passivo", "2", "24"],
      ["2433", "IVA Dedutível", "Ativo", "2", "243"],
      ["2434", "IVA Liquidado", "Passivo", "2", "243"],
      ["25", "Financiamentos obtidos", "Passivo", "2", "2"],
      ["3", "Inventários", "Ativo", "3", null],
      ["32", "Mercadorias", "Ativo", "3", "3"],
      ["4", "Investimentos", "Ativo", "4", null],
      ["43", "Ativos fixos tangíveis", "Ativo", "4", "4"],
      ["432", "Equipamento básico", "Ativo", "4", "43"],
      ["438", "Depreciações acumuladas", "Ativo (contra)", "4", "43"],
      ["5", "Capital, reservas e resultados transitados", "Capital Próprio", "5", null],
      ["51", "Capital", "Capital Próprio", "5", "5"],
      ["56", "Resultados transitados", "Capital Próprio", "5", "5"],
      ["6", "Gastos", "Gasto", "6", null],
      ["61", "Custo das mercadorias vendidas e das matérias consumidas", "Gasto", "6", "6"],
      ["611", "CMVMC", "Gasto", "6", "61"],
      ["62", "Fornecimentos e serviços externos", "Gasto", "6", "6"],
      ["622", "FSE", "Gasto", "6", "62"],
      ["6221", "FSE - Rendas e alugueres", "Gasto", "6", "622"],
      ["6222", "FSE - Comunicação", "Gasto", "6", "622"],
      ["6223", "FSE - Seguros", "Gasto", "6", "622"],
    ],
    contracts: [
      [15, "ARR-2023-014", "Contrato de Arrendamento Não Habitacional", "2023-06-01", "2028-05-31", 850,
        "CONTRATO DE ARRENDAMENTO NÃO HABITACIONAL Entre Predial Costa & Filhos, Lda (Senhorio) e Metalúrgica Aurora, Lda (Arrendatário), Referência: ARR-2023-014, com início em 01/06/2023 e termo em 31/05/2028. Renda mensal: 850,00 EUR. Objeto: arrendamento do armazém e instalações fabris.",
        145],
      [17, "SEG-MR-88231", "Apólice de Seguro Multirriscos Empresarial", "2025-08-15", "2026-08-15", 0,
        "APÓLICE DE SEGURO MULTIRRISCOS EMPRESARIAL Tomador do Seguro: Metalúrgica Aurora, Lda. Referência: SEG-MR-88231, com início em 15/08/2025 e termo em 15/08/2026 (renovação anual). Prémio anual único, sem mensalidade. Objeto: cobertura de incêndio, roubo e responsabilidade civil das instalações fabris.",
        146],
      [11, "FORN-2024-007", "Contrato-Quadro de Fornecimento de Mercadorias", "2024-02-01", "2027-01-31", 0,
        "CONTRATO-QUADRO DE FORNECIMENTO Entre Aços do Norte, Lda (Fornecedor) e Metalúrgica Aurora, Lda (Cliente), Referência: FORN-2024-007, com início em 01/02/2024 e termo em 31/01/2027. Faturação por encomenda, sem valor mensal fixo. Objeto: fornecimento contínuo de matérias-primas metálicas.",
        147],
      [null, "FIN-2022-091", "Contrato de Financiamento Bancário", "2022-09-01", "2028-08-31", 715,
        "CONTRATO DE MÚTUO COM HIPOTECA Entre Banco Montepio (Mutuante) e Metalúrgica Aurora, Lda (Mutuária), Referência: FIN-2022-091, com início em 01/09/2022 e termo em 31/08/2028. Prestação mensal: 715,00 EUR. Objeto: financiamento para aquisição de equipamento industrial, com hipoteca sobre o imóvel fabril.",
        148],
    ],
    documents: [
      ["Extrato Bancário", "extrato_banco_2025_11.pdf", null, "2025-11-28"],
      ["Extrato Bancário", "extrato_banco_2025_12.pdf", null, "2025-12-28"],
      ["Extrato Bancário", "extrato_banco_2026_01.pdf", null, "2026-01-28"],
      ["Extrato Bancário", "extrato_banco_2026_02.pdf", null, "2026-02-28"],
      ["Extrato Bancário", "extrato_banco_2026_03.pdf", null, "2026-03-28"],
      ["Extrato Bancário", "extrato_banco_2026_04.pdf", null, "2026-04-28"],
      ["Extrato Bancário", "extrato_banco_2026_05.pdf", null, "2026-05-28"],
      ["Extrato Bancário", "extrato_banco_2026_06.pdf", null, "2026-06-28"],
      ["Extrato Bancário", "extrato_banco_2026_07.pdf", null, "2026-07-28"],
      ["Recibo", "recibo_renda_2025_11.pdf", 15, "2025-11-28"],
      ["Fatura", "fatura_meo_2025_11.pdf", 16, "2025-11-28"],
      ["Fatura", "fatura_bright_ideas_2025_11.pdf", 18, "2025-11-28"],
      ["Folha de Vencimentos", "folha_vencimentos_2025_11.pdf", null, "2025-11-28"],
      ["Aviso de Débito", "prestacao_montepio_2025_11.pdf", null, "2025-11-28"],
      ["Fatura", "FT-0006.pdf", 1, "2025-11-28"],
      ["Fatura", "FT-0008.pdf", 9, "2025-11-20"],
      ["Fatura", "FT-0009.pdf", 8, "2025-11-24"],
      ["Fatura", "FT-0010.pdf", 9, "2025-11-06"],
      ["Fatura", "FT-0012.pdf", 5, "2025-11-17"],
      ["Fatura", "FT-0014.pdf", 8, "2025-11-10"],
      ["Fatura", "FC-0016.pdf", 11, "2025-11-08"],
      ["Fatura", "FC-0018.pdf", 11, "2025-11-11"],
      ["Fatura", "FC-0020.pdf", 12, "2025-11-13"],
      ["Fatura", "FC-0021.pdf", 11, "2025-11-25"],
      ["Recibo", "recibo_renda_2025_12.pdf", 15, "2025-12-28"],
      ["Fatura", "fatura_meo_2025_12.pdf", 16, "2025-12-28"],
      ["Fatura", "fatura_bright_ideas_2025_12.pdf", 18, "2025-12-28"],
      ["Folha de Vencimentos", "folha_vencimentos_2025_12.pdf", null, "2025-12-28"],
      ["Aviso de Débito", "prestacao_montepio_2025_12.pdf", null, "2025-12-28"],
      ["Fatura", "FT-0028.pdf", 7, "2025-12-27"],
      ["Fatura", "FT-0030.pdf", 10, "2025-12-16"],
      ["Fatura", "FT-0032.pdf", 1, "2025-12-22"],
      ["Fatura", "FT-0034.pdf", 3, "2025-12-18"],
      ["Fatura", "FT-0035.pdf", 10, "2025-12-01"],
      ["Fatura", "FC-0037.pdf", 12, "2025-12-13"],
      ["Fatura", "FC-0039.pdf", 13, "2025-12-13"],
      ["Fatura", "FC-0040.pdf", 14, "2025-12-03"],
      ["Recibo", "recibo_renda_2026_01.pdf", 15, "2026-01-28"],
      ["Fatura", "fatura_meo_2026_01.pdf", 16, "2026-01-28"],
      ["Fatura", "fatura_bright_ideas_2026_01.pdf", 18, "2026-01-28"],
      ["Folha de Vencimentos", "folha_vencimentos_2026_01.pdf", null, "2026-01-28"],
      ["Aviso de Débito", "prestacao_montepio_2026_01.pdf", null, "2026-01-28"],
    ],
    employees: [
      ["João Silva", "Operário metalúrgico", 1450, true],
      ["Pedro Costa", "Operário metalúrgico", 1350, true],
      ["Ana Rodrigues", "Comercial", 900, true],
      ["Maria Santos", "Administrativa", 500, true],
    ],
  },
  {
    name: "FlameCon Solutions, Lda",
    threadTitle: "Q1 Overdue Invoices Review",
    bankTransactions: [
      ["2025-11-25", "2025-11-25", "2025-11-25", "TRF Espaco Escritorio Renda 11/2025", -3200, "PT50 4460 4956 6053 6630 6261", "2", "Transferência", "1", 154985],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD NOS EMPRESAS 11/2025", -280.81, "PT50 0826 1995 8225 4282 1167", "3", "Débito Direto", "1", 154704.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD MICROSOFT AZURE 11/2025", -640, "PT50 6978 4649 3665 7872 0097", "4", "Débito Direto", "1", 154064.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD SLACK TECHNOLOGIES 11/2025", -156, "US64 SVBK US6S 0000 0001 59472487", "5", "Débito Direto", "1", 153908.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD FIGMA INC 11/2025", -90, "US64 SVBK US6S 0000 0001 51732904", "6", "Débito Direto", "1", 153818.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD GITHUB TEAM 11/2025", -248, "US64 SVBK US6S 0000 0001 35972203", "7", "Débito Direto", "1", 153570.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "DD GITHUB ENTERPRISE SEATS 11/2025", -189, "PT50 0859 9798 7320 0080 6232", "8", "Débito Direto", "1", 153381.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "TRF Tiago Moreira Dev 11/2025", -2800, "PT50 3898 6928 4140 7806 6717", "9", "Transferência", "1", 150581.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "TRF Ana Dias Design 11/2025", -2100, "PT50 4048 6844 3180 2433 2536", "10", "Transferência", "1", 148481.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "TRF GrowthLoop Agency 11/2025", -1800, "PT50 0063 9436 9919 2200 1192", "11", "Transferência", "1", 146681.19],
      ["2025-11-25", "2025-11-25", "2025-11-25", "TRF Salarios 11/2025", -58927.5, "N/A - folha de vencimentos", "12", "Transferência", "1", 87753.69],
      ["2025-11-20", "2025-11-20", "2025-11-21", "TRF recebido Banco Atlântico Digital, S.A.", 34440, "PT50 5260 1815 9083 0166 1318", "14", "Transferência", "1", 123745],
      ["2025-11-20", "2025-11-20", "2025-11-20", "TRF recebido Rede Saúde Plus, S.A.", 24600, "PT50 9603 0824 6281 9482 1993", "16", "Transferência", "1", 148345],
      ["2025-11-20", "2025-11-20", "2025-11-21", "TRF recebido LogiTrack Iberia, Lda", 4305, "PT50 7865 7975 4323 1948 7574", "18", "Transferência", "1", 152650],
      ["2025-11-20", "2025-11-20", "2025-11-20", "TRF recebido EduSpark Platforms, S.A.", 3075, "PT50 7601 8955 5979 7114 7104", "20", "Transferência", "1", 155725],
      ["2025-11-20", "2025-11-20", "2025-11-20", "TRF recebido Verde Energia Apps, Lda", 2460, "PT50 2917 0342 3667 1276 8426", "22", "Transferência", "1", 158185],
      ["2025-11-18", "2025-11-18", "2025-11-18", "TRF recebido PixelForge Studio, Lda", 4305, "PT50 1485 2538 8853 9336 3387", "24", "Transferência", "1", 89305],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF recebido ShopCraft eCommerce, Lda", 4790.31, "PT50 4234 6853 5606 8831 0679", "26", "Transferência", "2", 165729],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF Espaco Escritorio Renda 12/2025", -3200, "PT50 4460 4956 6053 6630 6261", "27", "Transferência", "2", 162529],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD NOS EMPRESAS 12/2025", -291.41, "PT50 0826 1995 8225 4282 1167", "28", "Débito Direto", "2", 162237.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD MICROSOFT AZURE 12/2025", -640, "PT50 6978 4649 3665 7872 0097", "29", "Débito Direto", "2", 161597.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD SLACK TECHNOLOGIES 12/2025", -156, "US64 SVBK US6S 0000 0001 59472487", "30", "Débito Direto", "2", 161441.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD FIGMA INC 12/2025", -90, "US64 SVBK US6S 0000 0001 51732904", "31", "Débito Direto", "2", 161351.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD GITHUB TEAM 12/2025", -248, "US64 SVBK US6S 0000 0001 35972203", "32", "Débito Direto", "2", 161103.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "DD GITHUB ENTERPRISE SEATS 12/2025", -189, "PT50 0859 9798 7320 0080 6232", "33", "Débito Direto", "2", 160914.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF Tiago Moreira Dev 12/2025", -2800, "PT50 3898 6928 4140 7806 6717", "34", "Transferência", "2", 158114.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF Ana Dias Design 12/2025", -2100, "PT50 4048 6844 3180 2433 2536", "35", "Transferência", "2", 156014.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF GrowthLoop Agency 12/2025", -1800, "PT50 0063 9436 9919 2200 1192", "36", "Transferência", "2", 154214.59],
      ["2025-12-25", "2025-12-25", "2025-12-25", "TRF Salarios 12/2025", -58927.5, "N/A - folha de vencimentos", "37", "Transferência", "2", 95287.09],
      ["2025-12-20", "2025-12-20", "2025-12-20", "TRF recebido Banco Atlântico Digital, S.A.", 34440, "PT50 5260 1815 9083 0166 1318", "39", "Transferência", "2", 126498.69],
    ],
    chartOfAccounts: [
      ["1", "Meios financeiros líquidos", "Ativo", "1", null],
      ["11", "Caixa", "Ativo", "1", "1"],
      ["12", "Depósitos à ordem", "Ativo", "1", "1"],
      ["2", "Contas a receber e a pagar", "Ativo/Passivo", "2", null],
      ["21", "Clientes", "Ativo", "2", "2"],
      ["211", "Clientes c/c", "Ativo", "2", "21"],
      ["22", "Fornecedores", "Passivo", "2", "2"],
      ["221", "Fornecedores c/c", "Passivo", "2", "22"],
      ["24", "Estado e outros entes públicos", "Ativo/Passivo", "2", "2"],
      ["243", "Imposto sobre o valor acrescentado", "Ativo/Passivo", "2", "24"],
      ["2433", "IVA Dedutível", "Ativo", "2", "243"],
      ["2434", "IVA Liquidado", "Passivo", "2", "243"],
      ["27", "Outras contas a receber e a pagar", "Ativo/Passivo", "2", "2"],
      ["272", "Proveitos a reconhecer (diferidos)", "Passivo", "2", "27"],
      ["4", "Investimentos", "Ativo", "4", null],
      ["43", "Ativos fixos tangíveis", "Ativo", "4", "4"],
      ["432", "Equipamento básico", "Ativo", "4", "43"],
      ["438", "Depreciações acumuladas", "Ativo (contra)", "4", "43"],
      ["5", "Capital, reservas e resultados transitados", "Capital Próprio", "5", null],
      ["51", "Capital", "Capital Próprio", "5", "5"],
      ["56", "Resultados transitados", "Capital Próprio", "5", "5"],
      ["6", "Gastos", "Gasto", "6", null],
      ["62", "Fornecimentos e serviços externos", "Gasto", "6", "6"],
      ["622", "FSE", "Gasto", "6", "62"],
      ["6221", "FSE - Rendas e alugueres", "Gasto", "6", "622"],
      ["6222", "FSE - Comunicação", "Gasto", "6", "622"],
      ["6223", "FSE - Seguros", "Gasto", "6", "622"],
      ["6224", "FSE - Honorários / Subcontratos", "Gasto", "6", "622"],
      ["6225", "FSE - Software e SaaS", "Gasto", "6", "622"],
      ["6226", "FSE - Cloud / infraestrutura", "Gasto", "6", "622"],
    ],
    contracts: [
      [1, "RET-2023-001", "Contrato de Retainer — Banco Atlântico Digital", "2023-09-01", "2027-08-31", 28000,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2023-001. Entre FlameCon Solutions, Lda (Prestador) e Banco Atlântico Digital, S.A. (Cliente), com início em 01/09/2023 e termo em 31/08/2027. Valor mensal: 28.000,00 EUR + IVA, faturado no início de cada mês. Objeto: desenvolvimento e manutenção contínua de plataformas digitais, suporte técnico prioritário e alocação de equipa dedicada.",
        193],
      [2, "RET-2024-007", "Contrato de Retainer — Rede Saúde Plus", "2024-02-01", "2027-01-31", 20000,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2024-007. Entre FlameCon Solutions, Lda e Rede Saúde Plus, S.A., com início em 01/02/2024 e termo em 31/01/2027. Valor mensal: 20.000,00 EUR + IVA. Objeto: desenvolvimento de software à medida, integrações com sistemas clínicos e suporte técnico mensal.",
        194],
      [9, "RET-2024-019", "Contrato de Retainer — PixelForge Studio (NÃO RENOVADO)", "2024-01-01", "2026-03-31", 3500,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2024-019. Entre FlameCon Solutions, Lda e PixelForge Studio, Lda, com início em 01/01/2024 e termo em 31/03/2026 (NÃO RENOVADO). Valor mensal: 3.500,00 EUR + IVA. Objeto: serviços de design e produção audiovisual.",
        195],
      [3, "RET-2025-011", "Contrato de Retainer — LogiTrack Iberia", "2025-04-01", "2027-03-31", 3500,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2025-011. Entre FlameCon Solutions, Lda e LogiTrack Iberia, Lda, com início em 01/04/2025 e termo em 31/03/2027. Valor mensal: 3.500,00 EUR + IVA. Objeto: manutenção de plataforma de logística e suporte técnico.",
        196],
      [4, "RET-2025-014", "Contrato de Retainer — EduSpark Platforms", "2025-06-01", "2026-12-31", 2500,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2025-014. Entre FlameCon Solutions, Lda e EduSpark Platforms, S.A., com início em 01/06/2025 e termo em 31/12/2026. Valor mensal: 2.500,00 EUR + IVA. Objeto: desenvolvimento de funcionalidades e suporte à plataforma educativa.",
        197],
      [5, "RET-2025-018", "Contrato de Retainer — Verde Energia Apps", "2025-08-01", "2027-07-31", 2000,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER Referência: RET-2025-018. Entre FlameCon Solutions, Lda e Verde Energia Apps, Lda, com início em 01/08/2025 e termo em 31/07/2027. Valor mensal: 2.000,00 EUR + IVA. Objeto: manutenção de aplicação móvel e integrações de monitorização energética.",
        198],
      [7, "RET-2026-ANNUAL-003", "Contrato de Retainer Anual Prepaid — Atlas Retail Cloud", "2026-01-01", "2026-12-31", 4000,
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — RETAINER ANUAL PREPAID Referência: RET-2026-ANNUAL-003. Entre FlameCon Solutions, Lda e Atlas Retail Cloud, Lda, com início em 01/01/2026 e termo em 31/12/2026. Valor mensal equivalente: 4.000,00 EUR + IVA, pago antecipadamente em parcela única anual. Objeto: suporte técnico e desenvolvimento contínuo.",
        199],
      [6, "PRJ-2025-044", "Contrato de Projeto — Nexus Commerce (eCommerce rebuild)", "2025-10-01", "2026-06-30", 0,
        "CONTRATO DE PROJETO — MILESTONE BASED Referência: PRJ-2025-044. Entre FlameCon Solutions, Lda e Nexus Commerce, Lda, com início em 01/10/2025 e termo previsto em 30/06/2026. Faturação por marcos de entrega (milestones), sem valor mensal fixo. Objeto: reconstrução completa da plataforma de comércio eletrónico.",
        200],
      [41, "ARR-2024-LIS-08", "Contrato de Arrendamento — Escritório Lisboa", "2024-03-01", "2029-02-28", 3200,
        "CONTRATO DE ARRENDAMENTO NÃO HABITACIONAL Entre Espaço Escritório Lisboa, Lda (Senhorio) e FlameCon Solutions, Lda (Arrendatário), Referência: ARR-2024-LIS-08, com início em 01/03/2024 e termo em 28/02/2029. Renda mensal: 3.200,00 EUR. Objeto: arrendamento do escritório sede em Lisboa.",
        201],
      [50, "SOW-2025-AD-12", "SOW — Ana Dias Design (UI/UX freelance)", "2025-09-01", "2026-08-31", 2100,
        "STATEMENT OF WORK — PRESTAÇÃO DE SERVIÇOS DE DESIGN Referência: SOW-2025-AD-12. Entre FlameCon Solutions, Lda e Ana Dias (freelancer), com início em 01/09/2025 e termo em 31/08/2026. Valor mensal: 2.100,00 EUR. Objeto: serviços de design UI/UX em regime de prestação de serviços.",
        202],
      [51, "MKT-2025-03", "Contrato de Serviços de Marketing — GrowthLoop", "2025-05-01", "2026-10-31", 1800,
        "CONTRATO DE SERVIÇOS DE MARKETING DIGITAL Referência: MKT-2025-03. Entre FlameCon Solutions, Lda e GrowthLoop Agency, Lda, com início em 01/05/2025 e termo em 31/10/2026. Valor mensal: 1.800,00 EUR + IVA. Objeto: gestão de campanhas de marketing digital e geração de leads.",
        203],
    ],
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [DEMO_EMAIL, DEMO_NAME, passwordHash]
    );
    const userId = userResult.rows[0].id;

    for (const company of COMPANIES) {
      const existingCompany = await pool.query<{ id: string }>(
        `SELECT id FROM companies WHERE name = $1`,
        [company.name]
      );
      const companyId =
        existingCompany.rows[0]?.id ??
        (
          await pool.query<{ id: string }>(
            `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
            [company.name]
          )
        ).rows[0].id;

      await pool.query(
        `INSERT INTO user_companies (user_id, company_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, companyId]
      );

      // Re-seeding bank_transactions is destructive-but-authoritative: there's
      // no UI yet for entering real transactions, so the seed data is always
      // the source of truth and re-running this script after editing the
      // arrays above should actually apply the edit rather than no-op.
      await pool.query(`DELETE FROM bank_transactions WHERE company_id = $1`, [companyId]);
      for (const row of company.bankTransactions) {
        await pool.query(
          `INSERT INTO bank_transactions
             (company_id, transaction_date, movement_date, value_date, description, amount,
              counterparty_iban, matched_journal_entry, operation_type, source_document, balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [companyId, ...row]
        );
      }

      if (company.chartOfAccounts) {
        await pool.query(`DELETE FROM chart_of_accounts WHERE company_id = $1`, [companyId]);
        for (const row of company.chartOfAccounts) {
          await pool.query(
            `INSERT INTO chart_of_accounts
               (company_id, account_code, account_name, account_class, snc_class, parent_account)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [companyId, ...row]
          );
        }
      }

      if (company.contracts) {
        await pool.query(`DELETE FROM contracts WHERE company_id = $1`, [companyId]);
        for (const row of company.contracts) {
          await pool.query(
            `INSERT INTO contracts
               (company_id, third_party_id, contract_ref, title, start_date, end_date,
                monthly_amount, full_text, source_document)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [companyId, ...row]
          );
        }
      }

      if (company.documents) {
        await pool.query(`DELETE FROM documents WHERE company_id = $1`, [companyId]);
        for (const row of company.documents) {
          await pool.query(
            `INSERT INTO documents (company_id, document_type, file_name, entity_id, "date")
             VALUES ($1, $2, $3, $4, $5)`,
            [companyId, ...row]
          );
        }
      }

      if (company.employees) {
        await pool.query(`DELETE FROM employees WHERE company_id = $1`, [companyId]);
        for (const row of company.employees) {
          await pool.query(
            `INSERT INTO employees (company_id, name, position, gross_monthly_salary, active)
             VALUES ($1, $2, $3, $4, $5)`,
            [companyId, ...row]
          );
        }
      }

      const existingThread = await pool.query(
        `SELECT id FROM chat_threads WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
        [userId, companyId]
      );
      if (existingThread.rowCount === 0) {
        await pool.query(
          `INSERT INTO chat_threads (company_id, user_id, title) VALUES ($1, $2, $3)`,
          [companyId, userId, company.threadTitle]
        );
      }
    }

    console.log("Seed complete.");
    console.log(`Demo login -> email: ${DEMO_EMAIL}  password: ${DEMO_PASSWORD}`);
    console.log(`Companies: ${COMPANIES.map((c) => c.name).join(", ")}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
