-- Nucase Agent schema — SQL Server (T-SQL), Azure SQL Database demo variant
--
-- Railway + Vanna migration (see .claude/skills/railway-vanna-migration/SKILL.md,
-- decision 11). This is schema.mssql.sql (the 7 confirmed tables, verbatim —
-- see that file's own header for their provenance) PLUS the minimal lookup
-- tables, real FK constraints, and lookup-prerequisite bootstrap rows those 7
-- tables need to actually enforce referential integrity — none of which
-- schema.mssql.sql itself carries (decision 9: the real dump's FK constraints
-- were never captured there, only PRIMARY KEY was, so a database built from
-- schema.mssql.sql alone — the Docker container, or these same 7 tables
-- applied any other way — has zero FK enforcement on them).
--
-- Why this exists / who should use it: the two local SQLEXPRESS example
-- databases (decision 8) already came pre-loaded with the FULL 1,695-table
-- PRIEXPRESS schema, so they've always had this referential integrity for
-- free. Azure SQL Database (decision 11 — the customer-demo target, since
-- Railway's own container runtime can't run the SQL Server Docker image at
-- all) starts genuinely empty — schema.mssql.sql alone is not enough to run
-- seed.mssql.ts --target=full against it, for the exact same structural
-- reason decision 9 documents for the Docker path (ExerciciosCBL, Moedas,
-- DocumentosVenda, SeriesVendas, DocumentosBancos don't exist). This file is
-- what closes that gap for a *fresh* target instead of just skipping the
-- prerequisites (--target=docker): run this once against an empty database,
-- then seed.mssql.ts --target=full works against it exactly as it does
-- against the two local SQLEXPRESS databases.
--
-- Apply via: MSSQL_CONNECTION_STRING=... SCHEMA_FILE=schema.mssql.azure.sql
-- npx tsx db/migrate.mssql.ts (see migrate.mssql.ts — SCHEMA_FILE defaults to
-- schema.mssql.sql, so the existing Docker/default path is untouched).
--
-- Not full PRIEXPRESS fidelity — deliberately minimal, "just enough
-- structure for the FK references to resolve" (the real lookup tables are
-- each dozens-to-hundreds of columns; these are single/composite-PK shells).
-- Column names on the populated lookups (Moedas, ExerciciosCBL, GruposContas,
-- DocumentosVenda, SeriesVendas, DocumentosBancos) match seed.mssql.ts's
-- buildLookupPrerequisites() exactly — see decision 9 there for what each
-- column means; the bootstrap INSERTs below are a literal transcription of
-- what that function already generates (same values, same NOCHECK/CHECK
-- bootstrap pattern for the ExerciciosCBL/GruposContas/ExerciciosERP circular
-- FK), not a reinvention — kept in sync by hand since one is TypeScript and
-- the other is static SQL; if buildLookupPrerequisites() changes, mirror the
-- change here too. Applying seed.mssql.ts --target=full afterward re-inserts
-- the same rows, guarded by the same IF NOT EXISTS checks, so it's a safe
-- no-op on top of this file rather than a conflict.
--
-- Column types on the 8 always-empty lookup tables (Paises, CondPag,
-- Categorias, Nacionalidades, OutrosTerceiros, ContasBancarias, RubricasCCT,
-- ExerciciosERP) are inferred from the referencing column's type in the 7
-- confirmed tables (see schema.mssql.sql) — not sourced from real DDL, since
-- decision 9 confirms these are completely empty on the real live databases
-- too and seed.mssql.ts never gives their referencing columns a value.

-- Bank Transactions: verbatim from priexpress_schema.sql (dbo.MovimentosBancos), wrapped for idempotency.
IF OBJECT_ID('dbo.MovimentosBancos', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[MovimentosBancos](
  	[Conta] [nvarchar](5) NULL,
  	[Rubrica] [nvarchar](35) NULL,
  	[Movim] [nvarchar](5) NULL,
  	[Valor] [float] NULL,
  	[Entidade] [nvarchar](15) NULL,
  	[DtMov] [datetime] NULL,
  	[DtValor] [datetime] NULL,
  	[DtRecon] [datetime] NULL,
  	[SerieCheques] [nvarchar](15) NULL,
  	[Obsv] [nvarchar](100) NULL,
  	[Estado] [smallint] NULL,
  	[TipoMov] [nvarchar](1) NULL,
  	[BalcaoCheque] [nvarchar](35) NULL,
  	[Emitido] [smallint] NULL,
  	[Juro] [float] NULL,
  	[Modulo] [nvarchar](1) NULL,
  	[TipoEntidade] [nvarchar](1) NULL,
  	[Numero] [nvarchar](15) NULL,
  	[Retencao] [float] NULL,
  	[FilialOriginal] [nvarchar](3) NULL,
  	[SerieOriginal] [nvarchar](5) NOT NULL,
  	[TipoDocOriginal] [nvarchar](5) NULL,
  	[NumDocOriginal] [int] NULL,
  	[Hora] [datetime] NULL,
  	[Utilizador] [nvarchar](20) NULL,
  	[Posto] [nvarchar](3) NULL,
  	[Descricao] [nvarchar](50) NULL,
  	[ComissaoMB] [float] NULL,
  	[VersaoUltAct] [timestamp] NULL,
  	[OutroMov] [bit] NULL,
  	[IdExportacaoPS2] [int] NULL,
  	[Id] [uniqueidentifier] NOT NULL,
  	[IdMovimentosBancos] [uniqueidentifier] NULL,
  	[IdReconciliacoes] [uniqueidentifier] NULL,
  	[IdTalaoDeposito] [uniqueidentifier] NULL,
  	[AnoCBL] [smallint] NULL,
  	[IdDiarioCaixa] [uniqueidentifier] NULL,
  	[IdTransferencia] [uniqueidentifier] NULL,
  	[IdChequeOrigem] [uniqueidentifier] NULL,
  	[ObraID] [uniqueidentifier] NULL,
  	[IdLinhasExtractoBancario] [uniqueidentifier] NULL,
  	[ReconciliadoPorExtracto] [bit] NOT NULL,
  	[ClasseID] [int] NULL,
  	[SubEmpID] [int] NULL,
  	[CategoriaID] [int] NULL,
  	[CambioMBase] [float] NOT NULL,
  	[CambioMAlt] [float] NOT NULL,
  	[ResultadoAgrupamento] [bit] NULL,
  	[MovimentoDividido] [bit] NULL,
  	[ContaCBL] [nvarchar](20) NULL,
  	[CCustoCBL] [nvarchar](15) NULL,
  	[AnaliticaCBL] [nvarchar](20) NULL,
  	[FunctionalCBL] [nvarchar](15) NULL,
  	[IdTEServicosBancarios] [uniqueidentifier] NULL,
  	[NumLinhaPS2] [int] NULL,
  	[TipoLancamentoOrigem] [varchar](3) NULL,
  	[CustoBancario] [bit] NOT NULL,
  	[CobrarCusto] [bit] NOT NULL,
  	[Selo] [nvarchar](15) NULL,
  	[Iva] [nvarchar](2) NULL,
  	[ValorPendente] [float] NULL,
  	[ValorDebitado] [float] NULL,
  	[DataIntroducao] [datetime] NULL,
  	[WBSItem] [nvarchar](100) NULL,
  	[NIBExportaPS2] [nvarchar](34) NULL,
  	[IdMovCBL] [uniqueidentifier] NULL,
   CONSTRAINT [MovimentosBancos01] PRIMARY KEY CLUSTERED 
  (
  	[Id] ASC
  )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY]
END
GO

-- Chart of Accounts: verbatim from priexpress_schema.sql (dbo.PlanoContas), wrapped for idempotency.
IF OBJECT_ID('dbo.PlanoContas', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[PlanoContas](
  	[Conta] [nvarchar](20) NOT NULL,
  	[Descricao] [nvarchar](100) NULL,
  	[ClasseIva] [nvarchar](10) NULL,
  	[ClasseSelo] [nvarchar](15) NULL,
  	[TipoConta] [nvarchar](1) NULL,
  	[ContaDB] [nvarchar](20) NULL,
  	[ContaDBRep] [nvarchar](3) NULL,
  	[ContaCR] [nvarchar](20) NULL,
  	[ContaCRRep] [nvarchar](3) NULL,
  	[ContaRep] [nvarchar](15) NULL,
  	[ContaRepFunc] [nvarchar](15) NULL,
  	[ChvRep] [nvarchar](3) NULL,
  	[ChvRepFunc] [nvarchar](3) NULL,
  	[CustoFixo] [real] NULL,
  	[PedeOrcam] [bit] NOT NULL,
  	[ContaCorrente] [bit] NULL,
  	[Retencao] [bit] NULL,
  	[Natureza] [nvarchar](1) NULL,
  	[Categoria] [nvarchar](2) NULL,
  	[TrataIMO] [bit] NULL,
  	[CorrecaoMonetaria] [bit] NULL,
  	[MoedaValores] [nvarchar](3) NULL,
  	[Ano] [smallint] NOT NULL,
  	[CAE] [nvarchar](15) NULL,
  	[Coeficiente] [float] NULL,
  	[Diario] [nvarchar](5) NULL,
  	[TaxaRetencao] [float] NULL,
  	[Linha] [smallint] NULL,
  	[SujeitoRetencao] [bit] NOT NULL,
  	[DesagregaNatureza] [bit] NOT NULL,
  	[NaturezaConta] [varchar](1) NULL,
  	[ContaDifCFavoraveis] [nvarchar](20) NULL,
  	[ContaDifCDesfavoraveis] [nvarchar](20) NULL,
  	[ContaDifCContrapartida] [nvarchar](20) NULL,
  	[IntegraCCT] [bit] NOT NULL,
  	[TipoContaCCT] [nvarchar](3) NULL,
  	[EstadoContaCCT] [nvarchar](4) NULL,
  	[TipoEntidade] [nvarchar](1) NULL,
  	[Entidade] [nvarchar](12) NULL,
  	[Inactivo] [bit] NULL,
  	[Grupo] [nvarchar](10) NULL,
  	[ContaAjusteNatureza] [nvarchar](20) NULL,
  	[ContaAjusteMedioPrazo] [nvarchar](20) NULL,
  	[ContaAjusteLongoPrazo] [nvarchar](20) NULL,
  	[ContaContrapartidaAjustes] [nvarchar](20) NULL,
  	[ItemTesouraria] [nvarchar](35) NULL,
  	[PodeAlterarItem] [bit] NULL,
  	[ContaAlternativa] [nvarchar](20) NULL,
  	[DescricaoAlternativa] [nvarchar](50) NULL,
  	[PodeAlterarEntidade] [bit] NOT NULL,
  	[PodeAlterarCCT] [bit] NOT NULL,
  	[Projecto] [nvarchar](40) NULL,
  	[WBSItem] [nvarchar](100) NULL,
  	[DataCriacao] [datetime] NULL,
  	[Actividade] [nvarchar](15) NULL,
  	[DescricaoActividade] [nvarchar](50) NULL,
  	[Unidade] [nvarchar](5) NULL,
  	[TipoCalculo] [varchar](1) NULL,
  	[ContaDebito] [nvarchar](20) NULL,
  	[EntidadeParceira] [nvarchar](5) NULL,
  	[ReflexaoOrc] [bit] NULL,
  	[AquisicaoTituloOneroso] [bit] NULL,
  	[TipoDivida] [smallint] NULL,
  	[ContaCentral] [nvarchar](10) NULL,
  	[ContaEstorno] [nvarchar](20) NULL,
  	[MotivoTributacao] [varchar](100) NULL,
  	[ExcluiS3CP] [bit] NULL,
  	[Exigibilidade] [nvarchar](6) NULL,
  	[NaturezaOperacao] [nvarchar](6) NULL,
  	[GrupoEndividamento] [nvarchar](6) NULL,
  	[TipoImo] [nvarchar](15) NULL,
  	[TrataEquipamentos] [bit] NOT NULL,
   CONSTRAINT [PlanoContas01] PRIMARY KEY CLUSTERED 
  (
  	[Ano] ASC,
  	[Conta] ASC
  )WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY]
END
GO

-- Contracts: verbatim from priexpress_schema.sql (dbo.FAC_CabecContratos), wrapped for idempotency.
IF OBJECT_ID('dbo.FAC_CabecContratos', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[FAC_CabecContratos](
  	[Contrato] [nvarchar](20) NOT NULL,
  	[Descricao] [nvarchar](100) NULL,
  	[Data] [datetime] NULL,
  	[Validade] [datetime] NULL,
  	[Referencia] [nvarchar](100) NULL,
  	[Limitado] [bit] NULL,
  	[ValorLimite] [float] NULL,
  	[Moeda] [nvarchar](3) NULL,
  	[EntidadeFactor] [nvarchar](12) NULL,
  	[ContaBancaria] [nvarchar](5) NULL,
  	[ContratoComRecurso] [bit] NULL,
  	[ContratoNacional] [bit] NULL,
  	[ComissaoCobranca] [float] NULL,
  	[ModoPagamento] [nvarchar](5) NULL,
  	[PeriodicidadeJuros] [smallint] NULL,
  	[ContaCredor] [nvarchar](20) NULL,
  	[ContaFinanciamentos] [nvarchar](20) NULL,
  	[ContaBanco] [nvarchar](20) NULL,
  	[CentroCusto] [nvarchar](15) NULL,
  	[Funcional] [nvarchar](15) NULL,
  	[ProjectoID] [uniqueidentifier] NULL,
  	[AnaliticaNatureza] [nvarchar](20) NULL,
  	[AnaliticaNaturezaInv] [nvarchar](20) NULL,
  	[ComissaoFixa1] [float] NULL,
  	[ComissaoFixa2] [float] NULL,
  	[UltimaTaxaJuro] [float] NULL,
  	[DataUltimaTaxaJuro] [datetime] NULL,
  	[WBSItem] [nvarchar](100) NULL,
  	[Observacoes] [ntext] NULL,
  	[TxJuroRefAnual] [smallint] NULL,
  	[TipoDocCessao] [varchar](5) NULL,
  	[SerieCessao] [varchar](5) NULL,
  	[TipoDocAdiantamento] [varchar](5) NULL,
  	[SerieAdiantamento] [varchar](5) NULL,
  	[TipoDocCustoBancario] [varchar](5) NULL,
  	[SerieCustoBancario] [varchar](5) NULL,
  	[TipoDocRegularizacao] [varchar](5) NULL,
  	[SerieRegularizacao] [varchar](5) NULL,
  	[MapaMinuta] [varchar](8) NULL,
  	[NumCopiasMinuta] [int] NOT NULL,
  	[PrevisualizaMinuta] [bit] NOT NULL,
  	[EnviaMinutaEmail] [bit] NOT NULL,
  	[TipoContactoEntidadeFactor] [nvarchar](15) NULL,
  	[MapaCartaCedencia] [varchar](8) NULL,
  	[NumCopiasCartaCedencia] [int] NOT NULL,
  	[PrevisualizaCartaCedencia] [bit] NOT NULL,
  	[EnviaCartaCedenciaEmail] [bit] NOT NULL,
  	[Estado] [tinyint] NOT NULL,
   CONSTRAINT [FAC_CabecContratos_PK] PRIMARY KEY CLUSTERED 
  (
  	[Contrato] ASC
  )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
END
GO

-- Employees: verbatim from priexpress_schema.sql (dbo.Funcionarios), wrapped for idempotency.
IF OBJECT_ID('dbo.Funcionarios', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Funcionarios](
  	[Codigo] [nvarchar](10) NOT NULL,
  	[Nome] [varchar](80) NULL,
  	[Localidade] [varchar](80) NULL,
  	[CodPostal1] [nvarchar](15) NULL,
  	[CodPostal2] [nvarchar](35) NULL,
  	[Naturalidade] [nvarchar](35) NULL,
  	[Distrito] [varchar](2) NULL,
  	[Nacionalidade] [nvarchar](3) NULL,
  	[Telefone] [nvarchar](15) NULL,
  	[EstadoCivil] [nvarchar](3) NULL,
  	[Sexo] [nvarchar](1) NULL,
  	[DataNascimento] [datetime] NULL,
  	[DataAdmissao] [datetime] NULL,
  	[DataReadmissao] [datetime] NULL,
  	[DataFimContrato] [datetime] NULL,
  	[Categoria] [nvarchar](10) NULL,
  	[Profissao] [nvarchar](12) NULL,
  	[Qualificacao] [nvarchar](3) NULL,
  	[DataQualif] [datetime] NULL,
  	[Habilitacao] [nvarchar](3) NULL,
  	[TipoContrato] [int] NULL,
  	[DataDemissao] [datetime] NULL,
  	[DataPromocao] [datetime] NULL,
  	[MotivoPromocao] [nvarchar](3) NULL,
  	[HorasSemana] [real] NULL,
  	[CodEstabelecimento] [nvarchar](3) NULL,
  	[Situacao] [nvarchar](3) NULL,
  	[SituacaoQP] [nvarchar](10) NULL,
  	[NumBI] [nvarchar](20) NULL,
  	[LocalEmBi] [nvarchar](20) NULL,
  	[DataEmBi] [datetime] NULL,
  	[CartaConducao] [nvarchar](15) NULL,
  	[Vencimento] [float] NULL,
  	[DataUltAumento] [datetime] NULL,
  	[MotivoAumento] [nvarchar](3) NULL,
  	[Notas] [ntext] NULL,
  	[NumContr] [nvarchar](20) NULL,
  	[CodRepFinancas] [nvarchar](5) NULL,
  	[CodIRS] [varchar](2) NULL,
  	[TotalDependentes] [smallint] NULL,
  	[TotalDepDeficientes] [smallint] NULL,
  	[ConjugeDef] [bit] NOT NULL,
  	[IRSFixo] [real] NULL,
  	[NomeConjuge] [nvarchar](50) NULL,
  	[CodSegSocial] [nvarchar](3) NULL,
  	[NumBeneficiario] [nvarchar](15) NULL,
  	[CodSindicato] [nvarchar](3) NULL,
  	[NumSindicato] [nvarchar](15) NULL,
  	[TipoProcessamento] [smallint] NULL,
  	[DataUltProcessamento] [datetime] NULL,
  	[DataSubsFerias] [datetime] NULL,
  	[MesSubsFerias] [smallint] NULL,
  	[DataSubsNatal] [datetime] NULL,
  	[TurnosTaxa] [smallint] NULL,
  	[TurnosDia] [smallint] NULL,
  	[SubsAlim1] [smallint] NULL,
  	[SubsAlim2] [smallint] NULL,
  	[ValorSubsAlim] [float] NULL,
  	[ValorSubsEsp] [float] NULL,
  	[DiasSubsNatal] [real] NULL,
  	[DiasSubsFerias] [real] NULL,
  	[SalHora] [real] NULL,
  	[HoraEntradaM] [real] NULL,
  	[HoraSaidaM] [real] NULL,
  	[HoraEntradaT] [real] NULL,
  	[HoraSaidaT] [real] NULL,
  	[Foto] [nvarchar](50) NULL,
  	[DataInspMedica] [datetime] NULL,
  	[DescricaoInspMedica] [nvarchar](35) NULL,
  	[CodBancoEmpr] [nvarchar](3) NULL,
  	[Morada] [varchar](80) NULL,
  	[TipoMoeda] [smallint] NULL,
  	[Email] [nvarchar](512) NULL,
  	[Periodo] [nvarchar](3) NULL,
  	[CodDepartamento] [nvarchar](10) NULL,
  	[NumPeriodoProcessado] [smallint] NULL,
  	[Instrumento] [nvarchar](3) NULL,
  	[SubsNatalProcessado] [bit] NOT NULL,
  	[VencimentoMensal] [float] NULL,
  	[DiuturnidadeMensal] [float] NULL,
  	[Diuturnidades] [float] NULL,
  	[NumHorasSemInstrumentos] [bit] NOT NULL,
  	[PertenceOrgaosSoc] [bit] NOT NULL,
  	[DataProximaDiuturnidade] [datetime] NULL,
  	[Telemovel] [nvarchar](15) NULL,
  	[LimiteContribuicoesSegSocial] [float] NULL,
  	[CGA] [nvarchar](3) NULL,
  	[NumCGA] [nvarchar](10) NULL,
  	[NomeCGA] [nvarchar](50) NULL,
  	[RegTmpPercAcresCGA] [real] NULL,
  	[NumDiuturnidadesCGA] [int] NULL,
  	[NivelRemCGA] [nvarchar](3) NULL,
  	[RegTmpSituacaoCGA] [nvarchar](3) NULL,
  	[RegTmpNumHorasCGA] [real] NULL,
  	[UltimaProgressao] [datetime] NULL,
  	[DiasSubsNatalJaPagos] [real] NULL,
  	[TipoPessoal] [nvarchar](3) NULL,
  	[UltimoAnoProcessado] [smallint] NOT NULL,
  	[DomicilioFiscal] [smallint] NOT NULL,
  	[Extensao] [nvarchar](15) NULL,
  	[CodSituacaoQP] [smallint] NOT NULL,
  	[NomeAbreviado] [nvarchar](25) NULL,
  	[Contrato] [nvarchar](3) NULL,
  	[DataAvisoPrevio] [datetime] NULL,
  	[PeriodoExp] [int] NULL,
  	[MotivoSaida] [nvarchar](3) NULL,
  	[DataValidadeCarta] [datetime] NULL,
  	[DataValidadeBI] [datetime] NULL,
  	[Concelho] [varchar](4) NULL,
  	[Freguesia] [varchar](2) NULL,
  	[DataIniProfissao] [datetime] NULL,
  	[DataHabilitacao] [datetime] NULL,
  	[CargoPrincipal] [nvarchar](5) NULL,
  	[RegimeTrab] [varchar](3) NULL,
  	[Altura] [float] NULL,
  	[GrupoSanguineo] [varchar](10) NULL,
  	[DeficienciasFisicas] [text] NULL,
  	[OutrasDadosFisicos] [text] NULL,
  	[DeficienciasCronicas] [text] NULL,
  	[DoencasHereditarias] [text] NULL,
  	[Cirurgias] [text] NULL,
  	[NomeDistrito] [varchar](35) NULL,
  	[NomeConcelho] [varchar](35) NULL,
  	[IdGDOC] [uniqueidentifier] NULL,
  	[NomeFreguesia] [varchar](50) NULL,
  	[VencimentoLiquidoEstimado] [money] NULL,
  	[Moeda] [nvarchar](3) NOT NULL,
  	[EpigrafeAT] [varchar](6) NULL,
  	[GrupoCotizacao] [varchar](2) NULL,
  	[Bonificacao] [varchar](3) NULL,
  	[IniciaisNomeSegSocial] [varchar](5) NULL,
  	[PercIncapacidade] [real] NULL,
  	[MobilidadeReduzida] [bit] NULL,
  	[ReducaoIrregularidades] [float] NULL,
  	[GastosDedutiveis] [float] NULL,
  	[PensaoConjuge] [float] NULL,
  	[PensaoFilhos] [float] NULL,
  	[MobilidadeGeografica] [bit] NULL,
  	[ProlongacaoActLaboral] [bit] NULL,
  	[VencimentoDiario] [float] NULL,
  	[TipoCalculoVencimento] [smallint] NULL,
  	[VencimentoConjSupLimite] [bit] NULL,
  	[NumPassaporte] [varchar](20) NULL,
  	[LocalEmPassaporte] [varchar](20) NULL,
  	[DataEmPassaporte] [datetime] NULL,
  	[DataValidadePassaporte] [datetime] NULL,
  	[NumIE] [varchar](20) NULL,
  	[LocalEmIE] [varchar](20) NULL,
  	[DataEmIE] [datetime] NULL,
  	[DataValidadeIE] [datetime] NULL,
  	[CodSeguro] [uniqueidentifier] NULL,
  	[DataInicioBonificacao] [datetime] NULL,
  	[DataFimBonificacao] [datetime] NULL,
  	[TipoRendimento] [nvarchar](5) NULL,
  	[GrupoTraco] [varchar](4) NULL,
  	[MinPessoalFamiliar] [float] NOT NULL,
  	[Regime] [smallint] NOT NULL,
  	[BaseCotizacao] [decimal](11, 2) NULL,
  	[CustoPadrao] [decimal](16, 5) NOT NULL,
  	[UtilizadoCCOP] [bit] NOT NULL,
  	[RecursoCCOP] [int] NULL,
  	[Isento] [bit] NOT NULL,
  	[PercVencParaSubsFerias] [nvarchar](200) NULL,
  	[PercVencParaSubsNatal] [nvarchar](200) NULL,
  	[EmprestimoBancario] [bit] NULL,
  	[EmprestimoBancarioAntesRegul] [bit] NULL,
  	[ValorAbateAntesRegul] [float] NOT NULL,
  	[RetribAnuaisIniciais] [float] NOT NULL,
  	[MotivoAdmissao] [nvarchar](3) NULL,
  	[PrimeiroNome] [nvarchar](80) NULL,
  	[PrimeiroApelido] [nvarchar](60) NULL,
  	[SegundoApelido] [nvarchar](60) NULL,
  	[ContribuinteNaoResidente] [nvarchar](20) NULL,
  	[AplicabilidadeIRCT] [varchar](10) NULL,
  	[CategoriaEscalao] [int] NULL,
  	[MesSubsNatal] [smallint] NULL,
  	[FormaPagSN] [nvarchar](10) NULL,
  	[FormaPagSF] [nvarchar](10) NULL,
  	[ProcDiasAnterioresSN] [bit] NOT NULL,
  	[ProcDiasAnterioresSF] [bit] NOT NULL,
  	[CodAlimDiasProc] [varchar](10) NULL,
  	[CodAlimValorFixo] [varchar](10) NULL,
  	[CodAlimEspecie] [varchar](10) NULL,
  	[TabIRPS] [nvarchar](20) NULL,
  	[LigadoTimesheets] [bit] NOT NULL,
  	[Pais] [nvarchar](2) NULL,
  	[ModContratoCom] [varchar](250) NULL,
  	[DataComunicacao] [datetime] NULL,
  	[UtilizadorComunicacao] [varchar](250) NULL,
  	[CartaoResidente] [varchar](50) NULL,
  	[DataEmissaoCR] [datetime] NULL,
  	[DataValidadeCR] [datetime] NULL,
  	[LocalEmCR] [varchar](20) NULL,
  	[ADSE] [nvarchar](3) NULL,
  	[AguardarAposentacao] [bit] NULL,
  	[AnosFuncaoPublica] [int] NULL,
  	[ComprovativoGravidez] [bit] NULL,
  	[DataAdmissaoOrgVinc] [datetime] NULL,
  	[DataAposentacao] [datetime] NULL,
  	[DataCessacaoOrgVinc] [datetime] NULL,
  	[DataDespachoDR] [datetime] NULL,
  	[DataGravidez] [datetime] NULL,
  	[DataInicioAdmPub] [datetime] NULL,
  	[DataInicioCategoria] [datetime] NULL,
  	[DataInicioEscalao] [datetime] NULL,
  	[DataValidadeADSE] [datetime] NULL,
  	[DiarioRepublica] [nvarchar](50) NULL,
  	[DiasFuncaoPublica] [int] NULL,
  	[DiasNaCategoria] [int] NULL,
  	[DiasNoEscalao] [int] NULL,
  	[DireitoSubsidioPreNatal] [bit] NULL,
  	[EducacaoFuncao] [nvarchar](1) NULL,
  	[EducacaoSituacao] [nvarchar](2) NULL,
  	[Escalao] [int] NULL,
  	[InactivoTemp] [bit] NULL,
  	[Indice] [int] NULL,
  	[MesesFuncaoPublica] [int] NULL,
  	[MotivoMC] [varchar](2) NULL,
  	[NivelRemuneratorio] [nvarchar](7) NULL,
  	[NumADSE] [nvarchar](12) NULL,
  	[NumeroNaciturnos] [int] NULL,
  	[OrgPagador] [varchar](5) NULL,
  	[OrgVinculo] [varchar](5) NULL,
  	[PercentIndice100] [float] NULL,
  	[ProcessoExecucao] [nvarchar](20) NULL,
  	[RegimeIndice100] [nvarchar](3) NULL,
  	[TabelaIrsAposentacao] [nvarchar](2) NULL,
  	[TipoBalancoSocial] [tinyint] NULL,
  	[Utilizador] [nvarchar](20) NULL,
  	[ValorDifPosicaoRemun] [float] NULL,
  	[ValorMensalAposentacao] [float] NULL,
  	[IdentContrFundos] [nvarchar](15) NULL,
  	[DataComFundos] [datetime] NULL,
  	[DataCessaFundos] [datetime] NULL,
  	[MotivoCessaFundos] [nvarchar](4) NULL,
  	[DataComAltVencFundos] [datetime] NULL,
  	[RegimeExRes] [tinyint] NULL,
  	[ModalidadeVinculacao] [nvarchar](3) NULL,
  	[CodInvInt] [nvarchar](30) NULL,
  	[NumBiDC] [nvarchar](4) NULL,
  	[HorasVolIEESP] [float] NULL,
  	[MedHorasVolIEESP] [tinyint] NOT NULL,
  	[ExternoIEESP] [nvarchar](2) NULL,
  	[CodInvNac] [nvarchar](30) NULL,
  	[ProcedimentoAdmissaoContrato] [nvarchar](3) NULL,
  	[FuncSubstituido] [nvarchar](10) NULL,
  	[AnoIRSJovem] [smallint] NULL,
  	[DataUltComunicacaoAlt] [datetime] NULL,
   CONSTRAINT [Funcionarios01] PRIMARY KEY CLUSTERED 
  (
  	[Codigo] ASC
  )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
END
GO

-- Invoices: verbatim from priexpress_schema.sql (dbo.CabecDoc), wrapped for idempotency.
IF OBJECT_ID('dbo.CabecDoc', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[CabecDoc](
  	[Data] [datetime] NULL,
  	[Zona] [nvarchar](2) NULL,
  	[Entidade] [nvarchar](12) NULL,
  	[TipoDoc] [nvarchar](5) NOT NULL,
  	[NumDoc] [int] NOT NULL,
  	[CondPag] [nvarchar](2) NULL,
  	[DescPag] [real] NULL,
  	[TotalMerc] [float] NULL,
  	[TotalIva] [float] NULL,
  	[TotalDesc] [float] NULL,
  	[TotalOutros] [float] NULL,
  	[ModoExp] [nvarchar](5) NULL,
  	[ModoPag] [nvarchar](5) NULL,
  	[UtilizaMoradaAltEntrega] [bit] NULL,
  	[MoradaAltEntrega] [nvarchar](10) NULL,
  	[Seccao] [nvarchar](2) NULL,
  	[RegimeIva] [nvarchar](1) NULL,
  	[Moeda] [nvarchar](3) NULL,
  	[Cambio] [float] NULL,
  	[Requisicao] [nvarchar](20) NULL,
  	[DataVencimento] [datetime] NULL,
  	[LocalCarga] [nvarchar](50) NULL,
  	[HoraCarga] [nvarchar](5) NULL,
  	[LocalDescarga] [nvarchar](50) NULL,
  	[HoraDescarga] [nvarchar](5) NULL,
  	[Matricula] [nvarchar](25) NULL,
  	[Filial] [nvarchar](3) NOT NULL,
  	[Serie] [nvarchar](5) NOT NULL,
  	[MoedaDaUEM] [bit] NULL,
  	[Arredondamento] [smallint] NULL,
  	[ArredondamentoIva] [smallint] NULL,
  	[IntrastatNatA] [nvarchar](2) NULL,
  	[IntrastatNatB] [nvarchar](2) NULL,
  	[IntrastatCondEnt] [nvarchar](3) NULL,
  	[IntrastatModoTransp] [nvarchar](1) NULL,
  	[IntrastatPorto] [nvarchar](4) NULL,
  	[Diario] [nvarchar](5) NULL,
  	[NumDiario] [int] NULL,
  	[DataUltimaActualizacao] [datetime] NULL,
  	[RespCobranca] [nvarchar](3) NULL,
  	[NumContribuinte] [nvarchar](20) NULL,
  	[Nome] [nvarchar](50) NULL,
  	[Morada] [nvarchar](50) NULL,
  	[Localidade] [nvarchar](50) NULL,
  	[CodPostal] [nvarchar](15) NULL,
  	[CodPostalLocalidade] [nvarchar](50) NULL,
  	[Utilizador] [nvarchar](20) NULL,
  	[Posto] [nvarchar](3) NULL,
  	[DocsOriginais] [ntext] NULL,
  	[Observacoes] [ntext] NULL,
  	[PercentagemRetencao] [float] NULL,
  	[TotalRetencao] [float] NULL,
  	[DataCarga] [nvarchar](20) NULL,
  	[DataDescarga] [nvarchar](20) NULL,
  	[TipoOperacao] [nvarchar](2) NULL,
  	[VersaoUltAct] [timestamp] NULL,
  	[Id] [uniqueidentifier] NOT NULL,
  	[IdCabecTesouraria] [uniqueidentifier] NULL,
  	[TipoEntidade] [nvarchar](1) NULL,
  	[DescEntidade] [real] NULL,
  	[Responsavel] [nvarchar](25) NULL,
  	[Referencia] [nvarchar](20) NULL,
  	[FluxoDocumental] [nvarchar](3) NULL,
  	[AnoCBL] [smallint] NULL,
  	[IdGDOC] [uniqueidentifier] NULL,
  	[ObraID] [uniqueidentifier] NULL,
  	[IdCabecEstorno] [uniqueidentifier] NULL,
  	[CDU_CabVar1] [nvarchar](15) NULL,
  	[CDU_CabVar2] [nvarchar](15) NULL,
  	[CDU_CabVar3] [nvarchar](15) NULL,
  	[CDU_CabVar4] [nvarchar](15) NULL,
  	[CDU_CabVar5] [nvarchar](15) NULL,
  	[CDU_CabVar1ENC] [nvarchar](15) NULL,
  	[CDU_CabVar2ENC] [nvarchar](15) NULL,
  	[CDU_CabVar3ENC] [nvarchar](15) NULL,
  	[CDU_CabVar4ENC] [nvarchar](15) NULL,
  	[CDU_CabVar5ENC] [nvarchar](15) NULL,
  	[IdDocB2B] [uniqueidentifier] NULL,
  	[LocalOperacao] [varchar](2) NULL,
  	[TotalEcotaxa] [float] NOT NULL,
  	[DE_IL] [nvarchar](20) NULL,
  	[CambioMBase] [float] NOT NULL,
  	[CambioMAlt] [float] NOT NULL,
  	[IDDiarioCaixa] [uniqueidentifier] NULL,
  	[TipoEntidadeEntrega] [nvarchar](1) NULL,
  	[EntidadeEntrega] [nvarchar](12) NULL,
  	[NomeEntrega] [nvarchar](50) NULL,
  	[MoradaEntrega] [nvarchar](50) NULL,
  	[LocalidadeEntrega] [nvarchar](50) NULL,
  	[CodPostalEntrega] [nvarchar](15) NULL,
  	[CodPostalLocalidadeEntrega] [nvarchar](50) NULL,
  	[IdCabecMovCbl] [uniqueidentifier] NULL,
  	[TotalRecargo] [float] NULL,
  	[TotalRetencaoGarantia] [float] NULL,
  	[Grupo] [varchar](30) NULL,
  	[Origem] [varchar](15) NULL,
  	[OrigemPOS] [bit] NOT NULL,
  	[Versao] [varchar](5) NULL,
  	[IDAvenca] [uniqueidentifier] NULL,
  	[ContaDomiciliacao] [varchar](5) NULL,
  	[Distrito] [varchar](2) NULL,
  	[DistritoEntrega] [varchar](2) NULL,
  	[IntrastatRegEstatistico] [varchar](1) NULL,
  	[Morada2] [nvarchar](50) NULL,
  	[TipoLancamento] [varchar](3) NULL,
  	[TipoEntidadeFac] [nvarchar](1) NULL,
  	[EntidadeFac] [nvarchar](12) NULL,
  	[NomeFac] [nvarchar](150) NULL,
  	[MoradaFac] [nvarchar](50) NULL,
  	[Morada2Fac] [nvarchar](50) NULL,
  	[LocalidadeFac] [nvarchar](50) NULL,
  	[CodigoPostalFac] [nvarchar](15) NULL,
  	[LocalidadeCodigoPostalFac] [nvarchar](50) NULL,
  	[NumContribuinteFac] [nvarchar](20) NULL,
  	[DistritoFac] [varchar](2) NULL,
  	[EntidadeDescarga] [nvarchar](12) NULL,
  	[TotalIEC] [float] NULL,
  	[DataGravacao] [datetime] NOT NULL,
  	[PendentePorLinha] [bit] NOT NULL,
  	[Assinatura] [nvarchar](255) NULL,
  	[VersaoAssinatura] [nvarchar](20) NULL,
  	[RegimeIvaReembolsos] [smallint] NOT NULL,
  	[EspacoFiscal] [smallint] NOT NULL,
  	[Morada2Entrega] [nvarchar](50) NULL,
  	[IdOportunidade] [uniqueidentifier] NULL,
  	[NumProposta] [smallint] NULL,
  	[PaisFac] [nvarchar](2) NULL,
  	[Pais] [nvarchar](2) NULL,
  	[RefDocOrig] [varchar](50) NULL,
  	[Certificado] [varchar](50) NULL,
  	[IdDocOrigem] [uniqueidentifier] NULL,
  	[ModuloOrigem] [nvarchar](1) NULL,
  	[CambioADataDoc] [bit] NOT NULL,
  	[WBSItem] [nvarchar](100) NULL,
  	[B2BTrataTrans] [bit] NOT NULL,
  	[B2BEnvioNaGravacao] [bit] NULL,
  	[PaisEntrega] [nvarchar](2) NULL,
  	[MoradaCarga] [nvarchar](50) NULL,
  	[Morada2Carga] [nvarchar](50) NULL,
  	[LocalidadeCarga] [nvarchar](50) NULL,
  	[CodPostalCarga] [nvarchar](15) NULL,
  	[CodPostalLocalidadeCarga] [nvarchar](50) NULL,
  	[DistritoCarga] [varchar](2) NULL,
  	[PaisCarga] [nvarchar](2) NULL,
  	[CAE] [varchar](15) NULL,
  	[Resumo] [bit] NULL,
  	[IDRegularizacao] [uniqueidentifier] NULL,
  	[TotalIS] [float] NOT NULL,
  	[TrataIvaCaixa] [bit] NOT NULL,
  	[CDU_CodigoLocalizacao] [varchar](13) NULL,
  	[ContratoID] [uniqueidentifier] NULL,
  	[Documento] [nvarchar](50) NULL,
  	[RefTipoDocOrig] [varchar](50) NULL,
  	[RefSerieDocOrig] [varchar](50) NULL,
  	[TotalDocumento] [float] NOT NULL,
  	[CertificadoRecuperacao] [nvarchar](50) NULL,
  	[MargemDoc] [float] NOT NULL,
  	[TipoFiscal] [varchar](3) NULL,
  	[TipoTerceiro] [nvarchar](3) NULL,
  	[Desatualizado] [bit] NOT NULL,
  	[DataHoraCarga] [datetime] NULL,
  	[DataHoraDescarga] [datetime] NULL,
  	[LastIndexDate] [datetime] NULL,
  	[PercentagemCativacao] [float] NULL,
  	[ValorEntregue] [float] NULL,
  	[ServContinuados] [bit] NOT NULL,
  	[CriadoPor] [nvarchar](20) NULL,
   CONSTRAINT [CabecDoc01] PRIMARY KEY CLUSTERED 
  (
  	[Id] ASC
  )WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
END
GO

-- Clients: verbatim from priexpress_schema.sql (dbo.Clientes), wrapped for idempotency.
IF OBJECT_ID('dbo.Clientes', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Clientes](
  	[Cliente] [nvarchar](12) NOT NULL,
  	[Nome] [nvarchar](50) NULL,
  	[Fac_Mor] [nvarchar](50) NULL,
  	[Fac_Local] [nvarchar](50) NULL,
  	[Fac_Cp] [nvarchar](15) NULL,
  	[Fac_Cploc] [nvarchar](50) NULL,
  	[Fac_Tel] [nvarchar](20) NULL,
  	[Fac_Fax] [nvarchar](20) NULL,
  	[Desconto] [real] NULL,
  	[TipoPrec] [nvarchar](1) NULL,
  	[TipoCred] [nvarchar](1) NULL,
  	[LimiteCred] [float] NULL,
  	[TotalDeb] [float] NULL,
  	[NumContrib] [nvarchar](20) NULL,
  	[Pais] [nvarchar](2) NULL,
  	[TipoCli] [nvarchar](1) NULL,
  	[AvisosVenc] [bit] NULL,
  	[ModoPag] [nvarchar](5) NULL,
  	[CondPag] [nvarchar](2) NULL,
  	[Moeda] [nvarchar](3) NULL,
  	[ModoExp] [nvarchar](5) NULL,
  	[Vendedor] [nvarchar](3) NULL,
  	[Zona] [nvarchar](2) NULL,
  	[NumViasDoc] [smallint] NULL,
  	[ExcluirRecap] [bit] NULL,
  	[EnderecoWeb] [nvarchar](50) NULL,
  	[DataCriacao] [datetime] NULL,
  	[CriacaoAutomatica] [bit] NULL,
  	[RubricaPagamentos] [nvarchar](35) NULL,
  	[RubricaRecebimentos] [nvarchar](35) NULL,
  	[TipoTerceiro] [nvarchar](3) NULL,
  	[ClienteAnulado] [bit] NULL,
  	[VendasNaoConvertidas] [float] NULL,
  	[EncomendasPendentes] [float] NULL,
  	[IntrastatCliente] [bit] NULL,
  	[IntrastatPorto] [nvarchar](4) NULL,
  	[SuporteAvisosVencimento] [nvarchar](1) NULL,
  	[DataUltimaActualizacao] [datetime] NULL,
  	[Notas] [ntext] NULL,
  	[EfectuaRetencao] [bit] NULL,
  	[Idioma] [nvarchar](3) NULL,
  	[UtilizaIdioma] [bit] NULL,
  	[TipoOperIntraCom] [nvarchar](2) NULL,
  	[VersaoUltAct] [timestamp] NULL,
  	[EfectuaOutrasRetencoes] [bit] NULL,
  	[IdContactoCob] [uniqueidentifier] NULL,
  	[ExcluirAlertasCob] [bit] NULL,
  	[AlertaValorSaldoCob] [bit] NULL,
  	[ValorSaldoCob] [float] NULL,
  	[AlertaIdadeSaldoCob] [bit] NULL,
  	[IdadeSaldoCob] [smallint] NULL,
  	[CalendarioCob] [ntext] NULL,
  	[Fac_Mor1] [nvarchar](50) NULL,
  	[LimiteCredValor] [bit] NULL,
  	[LimiteCredIdade] [bit] NULL,
  	[LimiteIdadeSaldo] [int] NULL,
  	[LimiteValorSaldo] [float] NULL,
  	[IdGDOC] [uniqueidentifier] NULL,
  	[Telefone2] [nvarchar](20) NULL,
  	[DebitoLetrasNovas] [bit] NULL,
  	[DebitoLetrasReformadas] [bit] NULL,
  	[CondDebitoLetrasParticular] [bit] NULL,
  	[JuroLetras] [float] NULL,
  	[JuroLetrasPostecipado] [bit] NULL,
  	[ComissaoLetras] [float] NULL,
  	[ComissaoLetrasPercent] [bit] NULL,
  	[PortesLetras] [float] NULL,
  	[CondDebitoLetrasParticularRef] [bit] NULL,
  	[JuroLetrasRef] [float] NULL,
  	[JuroLetrasPostecipadoRef] [bit] NULL,
  	[ComissaoLetrasRef] [float] NULL,
  	[ComissaoLetrasPercentRef] [bit] NULL,
  	[PortesLetrasRef] [float] NULL,
  	[CDU_CampoVar1] [nvarchar](15) NULL,
  	[CDU_CampoVar2] [nvarchar](15) NULL,
  	[CDU_CampoVar3] [nvarchar](15) NULL,
  	[B2BTrataTrans] [bit] NULL,
  	[B2BUtilArtigosParceiro] [bit] NULL,
  	[B2BEnvioNaGravacao] [bit] NULL,
  	[B2BEnderecoMail] [nvarchar](100) NULL,
  	[B2BCertificado] [nvarchar](250) NULL,
  	[LocalOperacao] [varchar](2) NULL,
  	[SujeitoRecargo] [bit] NULL,
  	[Toc] [real] NULL,
  	[FuncionarioToc] [nvarchar](10) NULL,
  	[FuncionarioResp] [nvarchar](10) NULL,
  	[CodPRIEMPRE] [nvarchar](10) NULL,
  	[Delegacao] [nvarchar](10) NULL,
  	[CentroOperacional] [nvarchar](10) NULL,
  	[Situacao] [nvarchar](10) NULL,
  	[Equipa] [nvarchar](10) NULL,
  	[Descricao] [varchar](50) NULL,
  	[Distrito] [varchar](2) NULL,
  	[GestaoDiasPag] [bit] NULL,
  	[DiaPagamento1] [tinyint] NULL,
  	[DiaPagamento2] [tinyint] NULL,
  	[DiaPagamento3] [tinyint] NULL,
  	[NumDiasRetrocesso] [tinyint] NULL,
  	[DiaInicPerNaoPag1] [varchar](5) NULL,
  	[DiaFinPerNaoPag1] [varchar](5) NULL,
  	[DiaInicPerNaoPag2] [varchar](5) NULL,
  	[DiaFinPerNaoPag2] [varchar](5) NULL,
  	[PessoaSingular] [bit] NOT NULL,
  	[CodigoGLN] [varchar](20) NULL,
  	[IDB2BFormato] [varchar](10) NULL,
  	[B2BEnderecoEnvio] [varchar](250) NULL,
  	[ModoRec] [nvarchar](5) NULL,
  	[Fac_Mor2] [nvarchar](50) NULL,
  	[NomeFiscal] [nvarchar](150) NULL,
  	[EncargosBanco] [bit] NULL,
  	[B2BDocDownload] [bit] NULL,
  	[B2BArtigosParceiro] [nvarchar](12) NULL,
  	[B2BUtilUnidadesParceiro] [bit] NULL,
  	[B2BUnidadesParceiro] [nvarchar](12) NULL,
  	[B2BIgnoraEnvioParceiro] [bit] NULL,
  	[B2BEnvioParceiro] [nvarchar](12) NULL,
  	[B2BIgnoraTransaccoes] [bit] NULL,
  	[B2BTransaccoes] [nvarchar](130) NULL,
  	[CodigoIEC] [nvarchar](15) NULL,
  	[CodigoIsencaoIEC] [nvarchar](5) NULL,
  	[IsentoIEC] [bit] NULL,
  	[SegmentoTerceiro] [nvarchar](10) NULL,
  	[RegimeIvaReembolsos] [smallint] NOT NULL,
  	[Factoring] [bit] NOT NULL,
  	[CambioADataDoc] [bit] NOT NULL,
  	[ContribuinteNaoResidente] [nvarchar](20) NULL,
  	[IntegraCessaoFactoring] [bit] NULL,
  	[ActividadeEmpresarial] [bit] NOT NULL,
  	[AutoFacturacao] [bit] NOT NULL,
  	[TrataIvaCaixa] [bit] NOT NULL,
  	[CDU_GLNFornecedor] [varchar](13) NULL,
  	[CDU_IgnoraElemFin] [bit] NULL,
  	[CDU_AplicaDescComercIntegracao] [bit] NULL,
  	[CDU_IgnoraDescArtB2B] [bit] NULL,
  	[VersaoCloud] [int] NULL,
  	[ActualizacaoCloud] [nvarchar](30) NULL,
  	[ActualizacaoERP] [nvarchar](30) NULL,
  	[FacturacaoAgrupadaBilling] [bit] NOT NULL,
  	[EntidadeParceira] [nvarchar](5) NULL,
  	[eGAR_Isenta] [bit] NOT NULL,
  	[eGAR_TipoProdutor] [varchar](3) NULL,
  	[eGAR_CodigoAPA] [varchar](15) NULL,
  	[eGAR_NumPGL] [varchar](50) NULL,
  	[TipoRemetente] [nvarchar](25) NULL,
  	[CodigoLocal] [nvarchar](20) NULL,
  	[LastIndexDate] [datetime] NULL,
  	[IVACativo] [bit] NULL,
  	[PercentagemCativacao] [float] NULL,
  	[ContaRecebimentos] [nvarchar](5) NULL,
  	[EntidadeDoEstado] [bit] NOT NULL,
  	[CDU_IgnoraElemEntidade] [bit] NULL,
   CONSTRAINT [Clientes01] PRIMARY KEY CLUSTERED 
  (
  	[Cliente] ASC
  )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
END
GO

-- Suppliers: verbatim from priexpress_schema.sql (dbo.Fornecedores), wrapped for idempotency.
IF OBJECT_ID('dbo.Fornecedores', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Fornecedores](
  	[Fornecedor] [nvarchar](12) NOT NULL,
  	[Nome] [nvarchar](50) NULL,
  	[Morada] [nvarchar](50) NULL,
  	[Local] [nvarchar](50) NULL,
  	[Cp] [nvarchar](15) NULL,
  	[CpLoc] [nvarchar](50) NULL,
  	[Tel] [nvarchar](20) NULL,
  	[Fax] [nvarchar](20) NULL,
  	[Desconto] [real] NULL,
  	[PrazoEnt] [nvarchar](3) NULL,
  	[TotalDeb] [float] NULL,
  	[LimiteCred] [float] NULL,
  	[NumContrib] [nvarchar](20) NULL,
  	[Pais] [nvarchar](2) NULL,
  	[TipoFor] [nvarchar](1) NULL,
  	[CondPag] [nvarchar](2) NULL,
  	[ModoPag] [nvarchar](5) NULL,
  	[Moeda] [nvarchar](3) NULL,
  	[ModoExp] [nvarchar](5) NULL,
  	[NumViasDoc] [smallint] NULL,
  	[ExcluirRecap] [bit] NULL,
  	[EnderecoWeb] [nvarchar](50) NULL,
  	[DataCriacao] [datetime] NULL,
  	[CriacaoAutomatica] [bit] NULL,
  	[RubricaPagamentos] [nvarchar](35) NULL,
  	[RubricaRecebimentos] [nvarchar](35) NULL,
  	[TipoTerceiro] [nvarchar](3) NULL,
  	[FornecedorAnulado] [bit] NULL,
  	[RegimeEspecial] [bit] NULL,
  	[ComprasNaoConvertidas] [float] NULL,
  	[EncomendasPendentes] [float] NULL,
  	[IntrastatFornecedor] [bit] NULL,
  	[IntrastatPorto] [nvarchar](4) NULL,
  	[DataUltimaActualizacao] [datetime] NULL,
  	[Notas] [ntext] NULL,
  	[EfectuaRetencao] [bit] NULL,
  	[ValorRetencao] [float] NULL,
  	[TextoExcepcaoRetencao] [nvarchar](100) NULL,
  	[Idioma] [nvarchar](3) NULL,
  	[UtilizaIdioma] [bit] NULL,
  	[VersaoUltAct] [timestamp] NULL,
  	[TipoRendimento] [nvarchar](5) NULL,
  	[EfectuaOutrasRetencoes] [bit] NULL,
  	[Morada1] [nvarchar](50) NULL,
  	[LimiteCredValor] [bit] NULL,
  	[LimiteCredIdade] [bit] NULL,
  	[LimiteIdadeSaldo] [int] NULL,
  	[LimiteValorSaldo] [float] NULL,
  	[IdGDOC] [uniqueidentifier] NULL,
  	[PosCustosBalSoc] [tinyint] NULL,
  	[CDU_CampoVar1] [nvarchar](15) NULL,
  	[CDU_CampoVar2] [nvarchar](15) NULL,
  	[CDU_CampoVar3] [nvarchar](15) NULL,
  	[B2BTrataTrans] [bit] NULL,
  	[B2BUtilArtigosParceiro] [bit] NULL,
  	[B2BEnvioNaGravacao] [bit] NULL,
  	[B2BEnderecoMail] [nvarchar](100) NULL,
  	[B2BCertificado] [nvarchar](250) NULL,
  	[LocalOperacao] [varchar](2) NULL,
  	[Descricao] [varchar](50) NULL,
  	[Distrito] [varchar](2) NULL,
  	[GestaoDiasPag] [bit] NULL,
  	[DiaPagamento1] [tinyint] NULL,
  	[DiaPagamento2] [tinyint] NULL,
  	[DiaPagamento3] [tinyint] NULL,
  	[NumDiasRetrocesso] [tinyint] NULL,
  	[PessoaSingular] [bit] NOT NULL,
  	[CodigoGLN] [varchar](20) NULL,
  	[IDB2BFormato] [varchar](10) NULL,
  	[B2BEnderecoEnvio] [varchar](250) NULL,
  	[ModoRec] [nvarchar](5) NULL,
  	[Morada2] [nvarchar](50) NULL,
  	[NomeFiscal] [nvarchar](150) NULL,
  	[B2BDocDownload] [bit] NULL,
  	[B2BArtigosParceiro] [nvarchar](12) NULL,
  	[B2BUtilUnidadesParceiro] [bit] NULL,
  	[B2BUnidadesParceiro] [nvarchar](12) NULL,
  	[B2BIgnoraEnvioParceiro] [bit] NULL,
  	[B2BEnvioParceiro] [nvarchar](12) NULL,
  	[B2BIgnoraTransaccoes] [bit] NULL,
  	[B2BTransaccoes] [nvarchar](130) NULL,
  	[CodigoIEC] [nvarchar](15) NULL,
  	[CodigoIsencaoIEC] [nvarchar](5) NULL,
  	[IsentoIEC] [bit] NULL,
  	[SegmentoTerceiro] [nvarchar](10) NULL,
  	[RegimeIvaReembolsos] [smallint] NOT NULL,
  	[CambioADataDoc] [bit] NOT NULL,
  	[ContribuinteNaoResidente] [nvarchar](20) NULL,
  	[AutoFacturacao] [bit] NOT NULL,
  	[SubUtilizadorAT] [varchar](50) NULL,
  	[SenhaSubUtilizadorAT] [varchar](200) NULL,
  	[Matricula] [varchar](50) NULL,
  	[Conservatoria] [varchar](50) NULL,
  	[CapitalSocial] [float] NULL,
  	[TrataIvaCaixa] [bit] NOT NULL,
  	[CDU_IgnoraElemFin] [bit] NULL,
  	[CDU_AplicaDescComercIntegracao] [bit] NULL,
  	[CDU_IgnoraDescArtB2B] [bit] NULL,
  	[VersaoCloud] [int] NULL,
  	[ActualizacaoCloud] [nvarchar](30) NULL,
  	[ActualizacaoERP] [nvarchar](30) NULL,
  	[ActividadeEmpresarial] [bit] NOT NULL,
  	[EntidadeParceira] [nvarchar](5) NULL,
  	[ControlaPagamentosDivida] [bit] NULL,
  	[DataValidadeFinancas] [datetime] NULL,
  	[DataValidadeSegSocial] [datetime] NULL,
  	[eGAR_Isenta] [bit] NOT NULL,
  	[eGAR_TipoProdutor] [varchar](3) NULL,
  	[eGAR_CodigoAPA] [varchar](15) NULL,
  	[eGAR_NumPGL] [varchar](50) NULL,
  	[TipoRemetente] [nvarchar](25) NULL,
  	[CodigoLocal] [nvarchar](20) NULL,
  	[IVACativo] [bit] NULL,
  	[PercentagemCativacao] [float] NULL,
   CONSTRAINT [Fornecedores01] PRIMARY KEY CLUSTERED 
  (
  	[Fornecedor] ASC
  )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
  ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
END
GO

-- ---------------------------------------------------------------------------
-- Lookup / reference tables (decision 9's list, plus DocumentosBancos and
-- ExerciciosERP — both structurally required by FKs decision 9 documents but
-- not named in that list's headline sentence). IF OBJECT_ID guarded, matching
-- schema.mssql.sql's idempotency convention.
-- ---------------------------------------------------------------------------

-- Always empty on the real live databases too (decision 9) — every column in
-- the 7 confirmed tables that references one of these is left NULL by
-- seed.mssql.ts, so these only need to exist for the FK definitions below to
-- be valid, never to hold rows.
IF OBJECT_ID('dbo.Paises', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Paises]([Pais] [nvarchar](2) NOT NULL, CONSTRAINT [Paises_PK] PRIMARY KEY CLUSTERED ([Pais] ASC))
END
GO

IF OBJECT_ID('dbo.CondPag', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[CondPag]([CondPag] [nvarchar](2) NOT NULL, CONSTRAINT [CondPag_PK] PRIMARY KEY CLUSTERED ([CondPag] ASC))
END
GO

IF OBJECT_ID('dbo.Categorias', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Categorias]([Categoria] [nvarchar](10) NOT NULL, CONSTRAINT [Categorias_PK] PRIMARY KEY CLUSTERED ([Categoria] ASC))
END
GO

IF OBJECT_ID('dbo.Nacionalidades', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Nacionalidades]([Nacionalidade] [nvarchar](3) NOT NULL, CONSTRAINT [Nacionalidades_PK] PRIMARY KEY CLUSTERED ([Nacionalidade] ASC))
END
GO

-- Real PK column name unknown (decision 9 never captured it) — "Terceiro"
-- (generic third-party code) is a reasonable approximation, not a verified
-- real column name.
IF OBJECT_ID('dbo.OutrosTerceiros', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[OutrosTerceiros]([Terceiro] [nvarchar](12) NOT NULL, CONSTRAINT [OutrosTerceiros_PK] PRIMARY KEY CLUSTERED ([Terceiro] ASC))
END
GO

IF OBJECT_ID('dbo.ContasBancarias', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ContasBancarias]([Conta] [nvarchar](5) NOT NULL, CONSTRAINT [ContasBancarias_PK] PRIMARY KEY CLUSTERED ([Conta] ASC))
END
GO

IF OBJECT_ID('dbo.RubricasCCT', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[RubricasCCT]([Rubrica] [nvarchar](35) NOT NULL, CONSTRAINT [RubricasCCT_PK] PRIMARY KEY CLUSTERED ([Rubrica] ASC))
END
GO

-- Populated (Moeda values used by every table's Moeda column — NOT NULL on
-- Funcionarios specifically, per decision 9).
IF OBJECT_ID('dbo.Moedas', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Moedas]([Moeda] [nvarchar](3) NOT NULL, CONSTRAINT [Moedas_PK] PRIMARY KEY CLUSTERED ([Moeda] ASC))
END
GO

-- GruposContas / ExerciciosCBL / ExerciciosERP: the circular-FK trio decision
-- 9 documents (ExerciciosCBL.Ano references both GruposContas.Ano and
-- ExerciciosERP.Ano; GruposContas.Ano references ExerciciosCBL.Ano back).
-- GruposContas.Grupo is the separate, non-circular target for
-- PlanoContas.Grupo. Real GruposContas/ExerciciosCBL are presumably wider in
-- production — only the columns buildLookupPrerequisites() actually sets are
-- reproduced here (decision 9's "not full fidelity" principle).
IF OBJECT_ID('dbo.ExerciciosERP', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ExerciciosERP]([Ano] [smallint] NOT NULL, CONSTRAINT [ExerciciosERP_PK] PRIMARY KEY CLUSTERED ([Ano] ASC))
END
GO

IF OBJECT_ID('dbo.GruposContas', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[GruposContas](
    [Grupo] [nvarchar](10) NOT NULL,
    [Ano] [smallint] NOT NULL,
    CONSTRAINT [GruposContas_PK] PRIMARY KEY CLUSTERED ([Grupo] ASC),
    CONSTRAINT [GruposContas_Ano_UQ] UNIQUE ([Ano])
  )
END
GO

IF OBJECT_ID('dbo.ExerciciosCBL', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ExerciciosCBL](
    [Ano] [smallint] NOT NULL,
    [CTBAnalitica] [bit] NOT NULL,
    [CTBCustos] [bit] NOT NULL,
    [CTBFuncoes] [bit] NOT NULL,
    [CTBFluxos] [bit] NOT NULL,
    [Bloqueado] [bit] NOT NULL,
    [TrataProjectoWBS] [bit] NOT NULL,
    [TipoExercicioCBL] [smallint] NOT NULL,
    [TA_TaxaAgravada] [bit] NOT NULL,
    CONSTRAINT [ExerciciosCBL_PK] PRIMARY KEY CLUSTERED ([Ano] ASC)
  )
END
GO

-- Circular pair — safe to create on empty tables (nothing to violate yet);
-- the bootstrap INSERT below is what actually needs the NOCHECK dance.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ExerciciosCBL_GruposContas_FK')
BEGIN
  ALTER TABLE [dbo].[ExerciciosCBL] WITH CHECK ADD CONSTRAINT [ExerciciosCBL_GruposContas_FK] FOREIGN KEY([Ano]) REFERENCES [dbo].[GruposContas] ([Ano])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ExerciciosCBL_ExerciciosERP_FK')
BEGIN
  ALTER TABLE [dbo].[ExerciciosCBL] WITH CHECK ADD CONSTRAINT [ExerciciosCBL_ExerciciosERP_FK] FOREIGN KEY([Ano]) REFERENCES [dbo].[ExerciciosERP] ([Ano])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'GruposContas_ExerciciosCBL_FK')
BEGIN
  ALTER TABLE [dbo].[GruposContas] WITH CHECK ADD CONSTRAINT [GruposContas_ExerciciosCBL_FK] FOREIGN KEY([Ano]) REFERENCES [dbo].[ExerciciosCBL] ([Ano])
END
GO

IF OBJECT_ID('dbo.DocumentosVenda', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[DocumentosVenda](
    [Documento] [nvarchar](5) NOT NULL,
    [Descricao] [nvarchar](60) NULL,
    [PermiteAltAposExp] [bit] NOT NULL,
    [RecolhaDE_IL] [bit] NOT NULL,
    [BalAnaliticaALT] [bit] NOT NULL,
    [BalFinanceiraALT] [bit] NOT NULL,
    [BalOrcamentalALT] [bit] NOT NULL,
    [ProcNecessidadesGPR] [bit] NOT NULL,
    [DisponivelPMS] [bit] NOT NULL,
    [NActualizaPCM] [bit] NOT NULL,
    [NActualizaPCU] [bit] NOT NULL,
    [NActualizaUltimaEntrada] [bit] NOT NULL,
    [NActualizaUltimaSaida] [bit] NOT NULL,
    [PermiteDocNegativo] [bit] NOT NULL,
    [PermiteLinhasNegativas] [bit] NOT NULL,
    [PermiteEstorno] [bit] NOT NULL,
    [DeduzLiquidaIVA] [bit] NOT NULL,
    [PendentePorLinha] [bit] NOT NULL,
    [DocumentoFactura] [bit] NOT NULL,
    [GeraAssinatura] [bit] NOT NULL,
    [BensCirculacao] [bit] NOT NULL,
    [Inactivo] [bit] NOT NULL,
    [ValorLimite] [decimal](18, 2) NOT NULL,
    [DocNaoValorizado] [bit] NOT NULL,
    [OperacaoControlaQtdSatisfeita] [smallint] NOT NULL,
    [SeparaControloQtdSatisfeita] [bit] NOT NULL,
    [ReservaAutomatica] [bit] NOT NULL,
    [IntegraEAP] [bit] NOT NULL,
    [SujeitoPGW] [bit] NOT NULL,
    CONSTRAINT [DocumentosVenda_PK] PRIMARY KEY CLUSTERED ([Documento] ASC)
  )
END
GO

IF OBJECT_ID('dbo.SeriesVendas', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[SeriesVendas](
    [TipoDoc] [nvarchar](5) NOT NULL,
    [Serie] [nvarchar](5) NOT NULL,
    [SeriePorDefeito] [bit] NOT NULL,
    [DataInicial] [date] NOT NULL,
    [DataFinal] [date] NOT NULL,
    [UtilizadoEmPMS] [bit] NOT NULL,
    [TipoEntidade] [smallint] NOT NULL,
    [SerieIntegracao] [bit] NOT NULL,
    [DisponivelNoEditor] [bit] NOT NULL,
    [MostraEcovalor] [bit] NOT NULL,
    [TipoComunicacao] [smallint] NOT NULL,
    [AutoFacturacao] [bit] NOT NULL,
    [Origem] [smallint] NOT NULL,
    [eGAR_AbreDocumento] [bit] NOT NULL,
    [eGAR_Comunica] [bit] NOT NULL,
    [EstadoComunicacao] [smallint] NOT NULL,
    [NumeradorComunicacao] [int] NOT NULL,
    [ComunicacaoManual] [bit] NOT NULL,
    [SerieRappel] [bit] NOT NULL,
    CONSTRAINT [SeriesVendas_PK] PRIMARY KEY CLUSTERED ([TipoDoc] ASC, [Serie] ASC),
    CONSTRAINT [SeriesVendas_DocumentosVenda_FK] FOREIGN KEY([TipoDoc]) REFERENCES [dbo].[DocumentosVenda] ([Documento])
  )
END
GO

IF OBJECT_ID('dbo.DocumentosBancos', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[DocumentosBancos](
    [Movim] [nvarchar](5) NOT NULL,
    [Descricao] [nvarchar](60) NULL,
    [PermiteAltAposExp] [bit] NOT NULL,
    [Letra] [bit] NOT NULL,
    [ChequePreDatado] [bit] NOT NULL,
    [Recibo] [bit] NOT NULL,
    [ExportaN68] [bit] NOT NULL,
    [ControlarValorAdicional] [bit] NOT NULL,
    CONSTRAINT [DocumentosBancos_PK] PRIMARY KEY CLUSTERED ([Movim] ASC)
  )
END
GO

-- ---------------------------------------------------------------------------
-- Lookup-prerequisite bootstrap rows. Literal transcription of
-- seed.mssql.ts's buildLookupPrerequisites() (same values, same NOCHECK/CHECK
-- bootstrap pattern for the ExerciciosCBL circular FK) — see that function's
-- doc comments for why each of these specific rows exists. YEAR = 2026,
-- matching seed.mssql.ts's YEAR constant.
-- ---------------------------------------------------------------------------

ALTER TABLE dbo.ExerciciosCBL NOCHECK CONSTRAINT ExerciciosCBL_ExerciciosERP_FK, ExerciciosCBL_GruposContas_FK;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ExerciciosCBL WHERE Ano = 2026)
BEGIN
  INSERT INTO dbo.ExerciciosCBL (Ano, CTBAnalitica, CTBCustos, CTBFuncoes, CTBFluxos, Bloqueado, TrataProjectoWBS, TipoExercicioCBL, TA_TaxaAgravada)
  VALUES (2026, 0, 0, 0, 0, 0, 0, 0, 0)
END
GO

ALTER TABLE dbo.ExerciciosCBL WITH NOCHECK CHECK CONSTRAINT ExerciciosCBL_ExerciciosERP_FK, ExerciciosCBL_GruposContas_FK;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Moedas WHERE Moeda = 'EUR')
BEGIN
  INSERT INTO dbo.Moedas (Moeda) VALUES (N'EUR'), (N'USD')
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.DocumentosVenda WHERE Documento = 'FT')
BEGIN
  INSERT INTO dbo.DocumentosVenda (Documento, Descricao, PermiteAltAposExp, RecolhaDE_IL, BalAnaliticaALT, BalFinanceiraALT, BalOrcamentalALT, ProcNecessidadesGPR, DisponivelPMS, NActualizaPCM, NActualizaPCU, NActualizaUltimaEntrada, NActualizaUltimaSaida, PermiteDocNegativo, PermiteLinhasNegativas, PermiteEstorno, DeduzLiquidaIVA, PendentePorLinha, DocumentoFactura, GeraAssinatura, BensCirculacao, Inactivo, ValorLimite, DocNaoValorizado, OperacaoControlaQtdSatisfeita, SeparaControloQtdSatisfeita, ReservaAutomatica, IntegraEAP, SujeitoPGW)
  VALUES
  (N'FT', N'Fatura', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  (N'FC', N'Fatura de Compra', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SeriesVendas WHERE TipoDoc = 'FT' AND Serie = 'A')
BEGIN
  INSERT INTO dbo.SeriesVendas (TipoDoc, Serie, SeriePorDefeito, DataInicial, DataFinal, UtilizadoEmPMS, TipoEntidade, SerieIntegracao, DisponivelNoEditor, MostraEcovalor, TipoComunicacao, AutoFacturacao, Origem, eGAR_AbreDocumento, eGAR_Comunica, EstadoComunicacao, NumeradorComunicacao, ComunicacaoManual, SerieRappel)
  VALUES
  (N'FT', N'A', 1, '2026-01-01', '2026-12-31', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
  (N'FC', N'A', 1, '2026-01-01', '2026-12-31', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0)
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.DocumentosBancos WHERE Movim = 'TRF')
BEGIN
  INSERT INTO dbo.DocumentosBancos (Movim, Descricao, PermiteAltAposExp, Letra, ChequePreDatado, Recibo, ExportaN68, ControlarValorAdicional)
  VALUES
  (N'TRF', N'Transferência Bancária', 0, 0, 0, 0, 0, 0),
  (N'DD', N'Débito Direto', 0, 0, 0, 0, 0, 0),
  (N'CHQ', N'Cheque', 0, 0, 0, 0, 0, 0),
  (N'DEP', N'Depósito', 0, 0, 0, 0, 0, 0),
  (N'LEV', N'Levantamento', 0, 0, 0, 0, 0, 0),
  (N'COM', N'Comissão Bancária', 0, 0, 0, 0, 0, 0)
END
GO

-- ---------------------------------------------------------------------------
-- Real FK constraints on the 7 confirmed tables (decision 9's documented
-- relationships). WITH CHECK (validates existing data) — safe against a
-- freshly-schema'd empty database, and also safe to run against a database
-- already seeded via --target=docker (no FK constraints), since the seeded
-- values already match: PlanoContas.Ano/CabecDoc.TipoDoc+Serie use the same
-- 2026/FT/FC/A values bootstrapped above, and every other FK'd column here is
-- either NULL (never set by seed.mssql.ts) or Moeda='EUR' (bootstrapped
-- above too). IF NOT EXISTS on sys.foreign_keys for idempotency.
-- ---------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MovimentosBancos_Conta_ContasBancarias')
BEGIN
  ALTER TABLE [dbo].[MovimentosBancos] WITH CHECK ADD CONSTRAINT [FK_MovimentosBancos_Conta_ContasBancarias] FOREIGN KEY([Conta]) REFERENCES [dbo].[ContasBancarias] ([Conta])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MovimentosBancos_Rubrica_RubricasCCT')
BEGIN
  ALTER TABLE [dbo].[MovimentosBancos] WITH CHECK ADD CONSTRAINT [FK_MovimentosBancos_Rubrica_RubricasCCT] FOREIGN KEY([Rubrica]) REFERENCES [dbo].[RubricasCCT] ([Rubrica])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MovimentosBancos_Movim_DocumentosBancos')
BEGIN
  ALTER TABLE [dbo].[MovimentosBancos] WITH CHECK ADD CONSTRAINT [FK_MovimentosBancos_Movim_DocumentosBancos] FOREIGN KEY([Movim]) REFERENCES [dbo].[DocumentosBancos] ([Movim])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PlanoContas_Ano_ExerciciosCBL')
BEGIN
  ALTER TABLE [dbo].[PlanoContas] WITH CHECK ADD CONSTRAINT [FK_PlanoContas_Ano_ExerciciosCBL] FOREIGN KEY([Ano]) REFERENCES [dbo].[ExerciciosCBL] ([Ano])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PlanoContas_Grupo_GruposContas')
BEGIN
  ALTER TABLE [dbo].[PlanoContas] WITH CHECK ADD CONSTRAINT [FK_PlanoContas_Grupo_GruposContas] FOREIGN KEY([Grupo]) REFERENCES [dbo].[GruposContas] ([Grupo])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FAC_CabecContratos_Moeda_Moedas')
BEGIN
  ALTER TABLE [dbo].[FAC_CabecContratos] WITH CHECK ADD CONSTRAINT [FK_FAC_CabecContratos_Moeda_Moedas] FOREIGN KEY([Moeda]) REFERENCES [dbo].[Moedas] ([Moeda])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FAC_CabecContratos_EntidadeFactor_OutrosTerceiros')
BEGIN
  ALTER TABLE [dbo].[FAC_CabecContratos] WITH CHECK ADD CONSTRAINT [FK_FAC_CabecContratos_EntidadeFactor_OutrosTerceiros] FOREIGN KEY([EntidadeFactor]) REFERENCES [dbo].[OutrosTerceiros] ([Terceiro])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Funcionarios_Nacionalidade_Nacionalidades')
BEGIN
  ALTER TABLE [dbo].[Funcionarios] WITH CHECK ADD CONSTRAINT [FK_Funcionarios_Nacionalidade_Nacionalidades] FOREIGN KEY([Nacionalidade]) REFERENCES [dbo].[Nacionalidades] ([Nacionalidade])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Funcionarios_Categoria_Categorias')
BEGIN
  ALTER TABLE [dbo].[Funcionarios] WITH CHECK ADD CONSTRAINT [FK_Funcionarios_Categoria_Categorias] FOREIGN KEY([Categoria]) REFERENCES [dbo].[Categorias] ([Categoria])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Funcionarios_Moeda_Moedas')
BEGIN
  ALTER TABLE [dbo].[Funcionarios] WITH CHECK ADD CONSTRAINT [FK_Funcionarios_Moeda_Moedas] FOREIGN KEY([Moeda]) REFERENCES [dbo].[Moedas] ([Moeda])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Funcionarios_Pais_Paises')
BEGIN
  ALTER TABLE [dbo].[Funcionarios] WITH CHECK ADD CONSTRAINT [FK_Funcionarios_Pais_Paises] FOREIGN KEY([Pais]) REFERENCES [dbo].[Paises] ([Pais])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CabecDoc_TipoDoc_DocumentosVenda')
BEGIN
  ALTER TABLE [dbo].[CabecDoc] WITH CHECK ADD CONSTRAINT [FK_CabecDoc_TipoDoc_DocumentosVenda] FOREIGN KEY([TipoDoc]) REFERENCES [dbo].[DocumentosVenda] ([Documento])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CabecDoc_TipoDocSerie_SeriesVendas')
BEGIN
  ALTER TABLE [dbo].[CabecDoc] WITH CHECK ADD CONSTRAINT [FK_CabecDoc_TipoDocSerie_SeriesVendas] FOREIGN KEY([TipoDoc], [Serie]) REFERENCES [dbo].[SeriesVendas] ([TipoDoc], [Serie])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CabecDoc_CondPag_CondPag')
BEGIN
  ALTER TABLE [dbo].[CabecDoc] WITH CHECK ADD CONSTRAINT [FK_CabecDoc_CondPag_CondPag] FOREIGN KEY([CondPag]) REFERENCES [dbo].[CondPag] ([CondPag])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CabecDoc_Moeda_Moedas')
BEGIN
  ALTER TABLE [dbo].[CabecDoc] WITH CHECK ADD CONSTRAINT [FK_CabecDoc_Moeda_Moedas] FOREIGN KEY([Moeda]) REFERENCES [dbo].[Moedas] ([Moeda])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CabecDoc_Pais_Paises')
BEGIN
  ALTER TABLE [dbo].[CabecDoc] WITH CHECK ADD CONSTRAINT [FK_CabecDoc_Pais_Paises] FOREIGN KEY([Pais]) REFERENCES [dbo].[Paises] ([Pais])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Clientes_Pais_Paises')
BEGIN
  ALTER TABLE [dbo].[Clientes] WITH CHECK ADD CONSTRAINT [FK_Clientes_Pais_Paises] FOREIGN KEY([Pais]) REFERENCES [dbo].[Paises] ([Pais])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Clientes_CondPag_CondPag')
BEGIN
  ALTER TABLE [dbo].[Clientes] WITH CHECK ADD CONSTRAINT [FK_Clientes_CondPag_CondPag] FOREIGN KEY([CondPag]) REFERENCES [dbo].[CondPag] ([CondPag])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Clientes_Moeda_Moedas')
BEGIN
  ALTER TABLE [dbo].[Clientes] WITH CHECK ADD CONSTRAINT [FK_Clientes_Moeda_Moedas] FOREIGN KEY([Moeda]) REFERENCES [dbo].[Moedas] ([Moeda])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Fornecedores_Pais_Paises')
BEGIN
  ALTER TABLE [dbo].[Fornecedores] WITH CHECK ADD CONSTRAINT [FK_Fornecedores_Pais_Paises] FOREIGN KEY([Pais]) REFERENCES [dbo].[Paises] ([Pais])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Fornecedores_CondPag_CondPag')
BEGIN
  ALTER TABLE [dbo].[Fornecedores] WITH CHECK ADD CONSTRAINT [FK_Fornecedores_CondPag_CondPag] FOREIGN KEY([CondPag]) REFERENCES [dbo].[CondPag] ([CondPag])
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Fornecedores_Moeda_Moedas')
BEGIN
  ALTER TABLE [dbo].[Fornecedores] WITH CHECK ADD CONSTRAINT [FK_Fornecedores_Moeda_Moedas] FOREIGN KEY([Moeda]) REFERENCES [dbo].[Moedas] ([Moeda])
END
GO
