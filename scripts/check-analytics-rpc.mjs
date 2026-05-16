#!/usr/bin/env node
/**
 * Sanity check das RPCs de analytics — roda diretamente contra o Supabase
 * (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env) e imprime o resultado
 * de cada RPC com janela "Hoje" (BRT). Útil antes/depois de aplicar a
 * migration-020 para confirmar que tudo responde sem erro.
 *
 * Uso:
 *   node scripts/check-analytics-rpc.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
    console.error('✗ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
    process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const tz = 'America/Sao_Paulo';
const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: tz });
const today = new Date();
const from = `${fmt(today)}T00:00:00-03:00`;
const to   = `${fmt(today)}T23:59:59.999-03:00`;

const RPCS = [
    ['analytics_unique_visitors',     { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_series',              { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_top_pages',           { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_top_referrers',       { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_utm_sources',         { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_devices',             { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_countries',           { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_recurring_visitors',  { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_latest_visits',       { from_ts: from, to_ts: to, lim: 5, exclude_admin: false }],
    ['analytics_latest_cv_clicks',    { from_ts: from, to_ts: to, lim: 5, exclude_admin: false }],
    ['analytics_top_recurring',       { from_ts: from, to_ts: to, lim: 5, exclude_admin: false }],
    // Novas (migration-020):
    ['analytics_hourly',              { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_dow',                 { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_funnel_unique',       { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_sessions',            { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_referrer_conversion', { from_ts: from, to_ts: to, exclude_admin: false }],
    ['analytics_retention',           { from_ts: from, to_ts: to, exclude_admin: false }],
];

console.log(`\nChecando ${RPCS.length} RPCs com janela ${from} → ${to}\n`);

let ok = 0, fail = 0;
for (const [name, args] of RPCS) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
        console.error(`✗ ${name.padEnd(36)} ERROR: ${error.message}`);
        fail++;
        continue;
    }
    const n = Array.isArray(data) ? data.length : 0;
    const preview = n > 0 ? JSON.stringify(data[0]).slice(0, 80) : '(vazio)';
    console.log(`✓ ${name.padEnd(36)} ${String(n).padStart(3)} linhas  ${preview}`);
    ok++;
}

console.log(`\n${ok} ok / ${fail} falhas\n`);
process.exit(fail > 0 ? 1 : 0);
