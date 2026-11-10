// Read-only MCP server over budget.json. Stateless: a fresh server per request.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { loadBudget } from './github.js';
import * as A from './analysis.js';

const date = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'YYYY-MM or YYYY-MM-DD');
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

export function contextOptions(env) {
  return {
    owner: env.OWNER_PERSON,
    includeHidden: env.INCLUDE_HIDDEN === 'true',
    includePartnerPrivate: env.INCLUDE_PARTNER_PRIVATE === 'true',
  };
}

export function buildServer(env, fetchImpl) {
  const server = new McpServer({ name: 'budget-together', version: '1.0.0' });
  const ctx = async () => A.makeContext(await loadBudget(env, fetchImpl), contextOptions(env));

  server.registerTool('list_categories', {
    title: 'List categories',
    description: 'All spending categories with whether they count as spending, fixed/variable/annual type, monthly budget, and how shared costs in that category are split between the two people.',
    inputSchema: {},
    annotations: RO,
  }, async () => json(A.listCategories(await ctx())));

  server.registerTool('list_transactions', {
    title: 'List transactions',
    description: 'Search transactions, newest first. Amount sign: positive = money out, negative = money in. Use category ids from list_categories.',
    inputSchema: {
      from: date.optional().describe('Start date (inclusive)'),
      to: date.optional().describe('End date (inclusive)'),
      category: z.string().optional(),
      person: z.string().optional().describe('Person name or p1/p2 (who paid)'),
      shared: z.boolean().optional(),
      search: z.string().optional().describe('Case-insensitive text in description/note'),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      limit: z.number().int().min(1).max(1000).optional().describe('Default 200'),
      offset: z.number().int().min(0).optional(),
    },
    annotations: RO,
  }, async (q) => json(A.listTransactions(await ctx(), q)));

  server.registerTool('spending_summary', {
    title: 'Spending summary',
    description: 'Spending and income totals grouped by month, category, or month+category, with each person\'s total (own spending + their share of shared spending), matching the app.',
    inputSchema: {
      from: date.optional(),
      to: date.optional(),
      groupBy: z.enum(['month', 'category', 'month_category']).optional().describe('Default month'),
    },
    annotations: RO,
  }, async (q) => json(A.spendingSummary(await ctx(), q)));

  server.registerTool('split_summary', {
    title: 'Shared costs and who owes whom',
    description: 'Outstanding balance between the two people exactly as the app\'s Settle screen shows it (all unsettled shared spending), plus shared totals, who paid, each person\'s share, and settled vs unsettled for an optional date range.',
    inputSchema: { from: date.optional(), to: date.optional() },
    annotations: RO,
  }, async (q) => json(A.splitSummary(await ctx(), q)));

  server.registerTool('housing', {
    title: 'Rent and housing',
    description: 'Housing (rent) payments by month with each person\'s share.',
    inputSchema: { from: date.optional(), to: date.optional() },
    annotations: RO,
  }, async (q) => json(A.housing(await ctx(), q)));

  server.registerTool('budget_vs_actual', {
    title: 'Budget vs actual',
    description: 'Monthly budget vs actual household spending per category for one month.',
    inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM') },
    annotations: RO,
  }, async (q) => json(A.budgetVsActual(await ctx(), q)));

  return server;
}

export async function handleMcp(request, env, fetchImpl) {
  const server = buildServer(env, fetchImpl);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
