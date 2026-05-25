// Source-of-truth SQL queries against Engage's MySQL (run via Metabase /api/dataset).
//
// The full lead-detail query is the analytical workhorse. The qualified-rollup is
// a compact aggregate used to refresh paid_assignments.qualified_leads on the
// budget table. Date bound is parameterized in-line because Metabase's native
// /api/dataset call interpolates safely when we use a single ISO date literal.

const SOURCE_BUCKET = `
CASE
  WHEN enquiry_source IN ('Website','Html','Html-Property','Live Chat','Hubspot','Engage APP') THEN 'Website'
  WHEN enquiry_source IN ('Whatsapp','Whatsapp Bot','Whatsapp Outreach - Lead Clone')
    OR is_wa_chat = 1 THEN 'WhatsApp'
  WHEN enquiry_source IN ('Direct Call','Cold Call','Phone','Customer Care','Call Center',
                          'Calls Better Homes Agent Direct','Calls Better Homes Office') THEN 'Phone'
  WHEN enquiry_source IN ('Email','Newsletter','Email Campaign') THEN 'Email'
  WHEN TRIM(enquiry_source) IN ('Facebook','Fb','Instagram','Ig','Meta',
                                'Meta-Static','Meta-Video',
                                'Meta-Retargeting-Static','Meta-Retargeting-Video',
                                'Meta-Cu-Static','Meta-Mix-Video','Meta-Uk-Chinese-Static') THEN 'Social - Meta'
  WHEN enquiry_source IN ('Tiktok','Snapchat','Linkedin','Twitter','Youtube','Vk','Pinterest') THEN 'Social - Other'
  WHEN enquiry_source IN ('Google','Google.com','Bing.com','Chatgpt.com') THEN 'Search'
  WHEN enquiry_source IN ('Newspaper','Newspapers','Outdoor','Outdoor Media','Outdoor Media/Signage',
                          'Signboard','Magazines','Property Magazine','Bh Magazine',
                          'Better Living Magazine','Flyers','Branded Items','General Signage',
                          'Agent-Flyer','Pr','Bh-Market-Updates_Pop-Up') THEN 'Print / Outdoor'
  WHEN enquiry_source IN ('Client Referral','Existing Client','Previous Tenant/Buyer',
                          'Previous Seller/Landlord','Word Of Mouth','Personal Referral',
                          'Referral From Existing Client','Referral','Friend Or Relative',
                          'Business/Company Referral','Agency Referral','Referral Within Company',
                          'Existing Client Better Homes','External Broker') THEN 'Referral'
  WHEN enquiry_source IN ('Agent','Agents','Agent Internal','Agent External',
                          'Agent Called The Client Direct','Database','Lead Farming-Call','Lead Farming-Email',
                          'Walk-In','Walks Into Better Homes Kiosk','Office/Internal','Touting','Prospecting',
                          'Open House','Renewals','Auto','Intercom',
                          'Grace','Betterask','LPI') THEN 'Internal'
  WHEN enquiry_source IN ('Campaign','Social Media Campaign','Sms Campaign','Programmatic Ads') THEN 'Campaign'
  WHEN enquiry_source IN ('Utm_Source','Source','Test-Source','Other') THEN 'Unknown'
  WHEN enquiry_source IS NULL THEN 'Unknown / Direct'
  ELSE 'Other'
END
`;

// Returns the analytical column subset of the leads query.
// `since` is an ISO date (YYYY-MM-DD). Excludes portal sources (PF/Bayut/etc).
export function buildLeadsAnalyticsSql(since: string): string {
  const safeSince = since.replace(/[^0-9-]/g, ''); // strict date format
  return `
WITH src AS (
  SELECT id, ${SOURCE_BUCKET} AS source_bucket
  FROM leads
  WHERE created_at >= '${safeSince}'
),
acts AS (
  SELECT a.lead_id,
    SUM(a.type='Qualification')                    AS qualifications,
    SUM(a.type='Valuation')                        AS valuations,
    SUM(a.type='Viewing' AND a.status='Scheduled') AS viewings_scheduled,
    SUM(a.type='Viewing' AND a.status='Completed') AS viewings_completed,
    SUM(a.type='Offer')                            AS offers,
    COUNT(*)                                       AS total_activities,
    MIN(a.datetime)                                AS first_activity_at,
    MAX(a.datetime)                                AS last_activity_datetime
  FROM activities a
  JOIN leads l ON l.id = a.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY a.lead_id
),
deal_out AS (
  SELECT d.lead_id,
    MAX(d.state)                          AS deal_state,
    MAX(d.status)                         AS deal_status,
    MAX(d.final_price)                    AS deal_final_price,
    MAX(d.final_gross_commission_amount)  AS deal_commission,
    MAX(d.reserved_at)                    AS deal_reserved_at,
    MAX(d.closed_at)                      AS deal_closed_at
  FROM deals d
  JOIN leads l ON l.id = d.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY d.lead_id
),
cc AS (
  SELECT cch.resource_id AS lead_id,
    MIN(cch.created_at)             AS first_comm_at,
    MAX(cch.created_at)             AS last_comm_at,
    COUNT(*)                        AS customer_comm_count,
    SUM(cch.successful = 1)         AS successful_contacts
  FROM customer_contact_histories cch
  JOIN leads l ON l.id = cch.resource_id AND l.created_at >= '${safeSince}'
  WHERE cch.resource_type = 'Lead'
  GROUP BY cch.resource_id
)
SELECT
  l.id                                                    AS lead_id,
  l.created_at                                            AS lead_created_at,
  l.type                                                  AS client_type,
  l.status                                                AS current_stage,
  l.state                                                 AS lead_state,
  l.score                                                 AS lead_score,
  src.source_bucket                                       AS canonical_source,
  l.enquiry_source                                        AS raw_source,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.source')),  'null') AS utm_source,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.medium')),  'null') AS utm_medium,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')),'null') AS utm_campaign,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.term')),    'null') AS utm_term,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.content')), 'null') AS utm_content,
  br.name                                                 AS branch,
  dv.name                                                 AS division,
  1                                                       AS stage_1_lead_received,
  CASE WHEN COALESCE(acts.qualifications,0) > 0
        OR l.status IN ('Qualified','Viewing','Offer','Reserved','Deal','Valuation','Listed')
       THEN 1 ELSE 0 END                                  AS stage_2_qualified,
  CASE WHEN COALESCE(acts.valuations,0) > 0
        OR l.status IN ('Valuation','Listed','Reserved','Deal')
       THEN 1 ELSE 0 END                                  AS stage_2b_valuation,
  CASE WHEN l.status IN ('Listed','Reserved','Deal')
       THEN 1 ELSE 0 END                                  AS stage_3b_listed,
  CASE WHEN COALESCE(acts.viewings_scheduled,0) > 0
        OR COALESCE(acts.viewings_completed,0) > 0
        OR l.status IN ('Viewing','Offer','Reserved','Deal')
       THEN 1 ELSE 0 END                                  AS stage_3_viewing,
  CASE WHEN COALESCE(acts.offers,0) > 0
        OR l.status IN ('Offer','Reserved','Deal')
       THEN 1 ELSE 0 END                                  AS stage_4_offer,
  CASE WHEN dl.deal_reserved_at IS NOT NULL
        OR l.status IN ('Reserved','Deal')
        OR dl.deal_status IN ('Reserved','In Review')
       THEN 1 ELSE 0 END                                  AS stage_5_reserved,
  CASE WHEN dl.deal_closed_at IS NOT NULL
       THEN 1 ELSE 0 END                                  AS stage_6_deal_closed,
  COALESCE(cc.customer_comm_count,0)                      AS customer_comm_count,
  COALESCE(cc.successful_contacts,0)                      AS successful_contacts,
  CASE
    WHEN LEAST(IFNULL(acts.first_activity_at,'9999-12-31'),
               IFNULL(cc.first_comm_at,      '9999-12-31')) = '9999-12-31' THEN NULL
    ELSE TIMESTAMPDIFF(HOUR, l.created_at,
           LEAST(IFNULL(acts.first_activity_at,'9999-12-31'),
                 IFNULL(cc.first_comm_at,      '9999-12-31')))
  END                                                     AS hours_to_first_touch,
  CASE
    WHEN COALESCE(acts.total_activities,0)=0
     AND COALESCE(cc.customer_comm_count,0)=0    THEN 'NEVER_TOUCHED'
    WHEN l.state = 'Open'
     AND DATEDIFF(NOW(), GREATEST(
            IFNULL(acts.last_activity_datetime,'1970-01-01'),
            IFNULL(cc.last_comm_at,             '1970-01-01'))) > 7 THEN 'STALE_>7D'
    WHEN l.state = 'Open'
     AND DATEDIFF(NOW(), GREATEST(
            IFNULL(acts.last_activity_datetime,'1970-01-01'),
            IFNULL(cc.last_comm_at,             '1970-01-01'))) > 3 THEN 'COOLING_>3D'
    WHEN l.state = 'Closed'    THEN 'CLOSED'
    WHEN l.state = 'Completed' THEN 'COMPLETED'
    ELSE 'ACTIVE'
  END                                                     AS responsiveness_flag,
  CASE
    WHEN dl.deal_closed_at IS NOT NULL                        THEN 'Closed'
    WHEN dl.deal_status IN ('Reserved','In Review','Draft')   THEN 'In Deal'
    WHEN l.status      IN ('Reserved','Deal')                 THEN 'Reserved'
    ELSE 'Not Converted'
  END                                                     AS conversion_status,
  dl.deal_final_price,
  dl.deal_commission,
  dl.deal_reserved_at,
  dl.deal_closed_at
FROM leads l
LEFT JOIN branches  br ON br.id = (SELECT u2.branch_id FROM users u2 WHERE u2.id = l.agent_id)
LEFT JOIN divisions dv ON dv.id = l.division_id
LEFT JOIN src         ON src.id = l.id
LEFT JOIN acts        ON acts.lead_id = l.id
LEFT JOIN deal_out dl ON dl.lead_id = l.id
LEFT JOIN cc          ON cc.lead_id = l.id
WHERE l.created_at >= '${safeSince}'
  AND (l.enquiry_source IS NULL
       OR l.enquiry_source NOT IN ('PF','Bayut','Dubizzle','LRE','Propsearch'))
ORDER BY l.created_at DESC
`;
}

// Aggregate: qualified-lead count grouped by utm_campaign (case-insensitive trim).
// Used to refresh paid_assignments.qualified_leads.
export function buildQualifiedRollupSql(since: string): string {
  const safeSince = since.replace(/[^0-9-]/g, '');
  return `
SELECT
  TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')), 'null')) AS utm_campaign,
  SUM(
    CASE WHEN l.status IN ('Qualified','Viewing','Offer','Reserved','Deal','Valuation','Listed')
              OR EXISTS (
                SELECT 1 FROM activities a
                WHERE a.lead_id = l.id AND a.type IN ('Qualification','Valuation'))
         THEN 1 ELSE 0 END
  ) AS qualified_leads
FROM leads l
WHERE l.created_at >= '${safeSince}'
  AND JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')) <> 'null'
GROUP BY TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')), 'null'))
HAVING utm_campaign IS NOT NULL AND utm_campaign <> ''
`;
}
