// Source-of-truth SQL queries against Engage's MySQL (run via Metabase
// /api/dataset/json export endpoint, which bypasses the 2000-row userland cap).
//
// The full analytics query is the workhorse for /analytics. The qualified-rollup
// is a compact aggregate used to refresh paid_assignments.qualified_leads on the
// budget table. Date bound is parameterized in-line because Metabase's
// /api/dataset call interpolates safely when we use a single ISO date literal.

// Expanded source bucket — covers ~241 distinct enquiry_source values seen in
// production. Anything that doesn't match falls into 'Other'.
const SOURCE_BUCKET = `
CASE
  WHEN enquiry_source IN ('Website','Html','Html-Property','Live Chat','Hubspot','Engage APP',
                          'Html-Weekly Mix','Html-Enewsletter (Sat)','Html - Open House',
                          'Html - Office','Html-Agent','Weekly Hot Properties','Weekly Mix',
                          'Internet') THEN 'Website'

  WHEN enquiry_source IN ('Whatsapp','Whatsapp Bot','Whatsapp Outreach - Lead Clone','Email/Wa')
    OR is_wa_chat = 1 THEN 'WhatsApp'

  WHEN enquiry_source IN ('Direct Call','Cold Call','Phone','Customer Care','Call Center',
                          'Calls Better Homes Agent Direct','Calls Better Homes Office') THEN 'Phone'

  WHEN enquiry_source IN ('Email','Newsletter','Email Campaign','Activecampaign','Company Email') THEN 'Email'

  WHEN TRIM(enquiry_source) IN ('Facebook','Fb','Instagram','Ig','Meta',
                                'Meta-Static','Meta-Video',
                                'Meta-Retargeting-Static','Meta-Retargeting-Video',
                                'Meta-Cu-Static','Meta-Mix-Video','Meta-Uk-Chinese-Static') THEN 'Social - Meta'

  WHEN enquiry_source IN ('Tiktok','Snapchat','Linkedin','Twitter','Youtube','Vk','Pinterest',
                          'Social Media') THEN 'Social - Other'

  WHEN enquiry_source IN ('Google','Google.com','Bing.com','Chatgpt.com','Adwords') THEN 'Search'

  WHEN enquiry_source IN ('Newspaper','Newspapers','Outdoor','Outdoor Media','Outdoor Media/Signage',
                          'Signboard','Magazines','Property Magazine','Bh Magazine',
                          'Better Living Magazine','Flyers','Branded Items','General Signage',
                          'Agent-Flyer','Pr','Bh-Market-Updates_Pop-Up',
                          'Gulfnews','Gulf News','Uae-Gulf News Generic','Gulfnews-Open House',
                          'Bh Cars','Al Bayan','Abu Dhabi Week','Al Ayam','Al Watan',
                          'Uae-Al Khaleej','Magazine','Radio','Dubai 92','104.4 Virgin Radio Dubai',
                          'Open House Banner','Drive Around','Exhibition Stand','Door Hanger',
                          'Outdoor Signage','Business Card','Reception Flyers',
                          'California Village Ooh','Palm Kiosk','Forbes Mailer',
                          'Property Flyers / Brochures / Door Hangers',
                          'Agent Flyers / Brochures / Door Hangers',
                          'To Let - Small Property Signage','Other Print - Do Not Use')
    OR enquiry_source LIKE 'Shj-%' OR enquiry_source LIKE 'Dxb-%' OR enquiry_source LIKE 'Dxbã%' THEN 'Print / Outdoor'

  WHEN enquiry_source IN ('Client Referral','Existing Client','Previous Tenant/Buyer',
                          'Previous Seller/Landlord','Word Of Mouth','Personal Referral',
                          'Referral From Existing Client','Referral','Friend Or Relative',
                          'Business/Company Referral','Agency Referral','Referral Within Company',
                          'Existing Client Better Homes','External Broker',
                          'Direct Client','Old Client','Old Landlord','Referral From Colleague',
                          'Corporate References','Agency Partner Network','Broker Connector') THEN 'Referral'

  WHEN enquiry_source IN ('Agent','Agents','Agent Internal','Agent External',
                          'Agent Called The Client Direct','Database','Lead Farming-Call','Lead Farming-Email',
                          'Walk-In','Walks Into Better Homes Kiosk','Office/Internal','Touting','Prospecting',
                          'Open House','Renewals','Auto','Intercom','Grace','Betterask','LPI',
                          'Voice Qualified','Networking','Relocation','Relocation Agent','Event',
                          'Off Plan','Property','Property Management','Property Acquisition Department',
                          'Developer','Prime','List Call','Kadam',
                          'Enbd Portfolio','Bh Marzouqi','Dmcc','Fujairah Pmgt','Central Listing',
                          'Jlt Manual Account','Commercial People','Residential People',
                          'Do Not Use - Prospecting','Do Not Use - Dubai Marina Kiosk',
                          'Do Not Use - Customer Care - Open House','Do Not Use - Exhibition',
                          'Key With Bh Vision Tower Office')
    OR enquiry_source LIKE 'Uae - %' OR enquiry_source LIKE 'Uae-%' THEN 'Internal'

  WHEN enquiry_source IN ('Campaign','Social Media Campaign','Sms Campaign','Sms','Programmatic Ads') THEN 'Campaign'

  WHEN enquiry_source IN ('Utm_Source','Source','Test-Source','Test','Other','Others','Not Specified',
                          'Client Did Not Provide Media Name','Cce Did Not Probe For Media Name') THEN 'Unknown'

  WHEN enquiry_source IS NULL THEN 'Unknown / Direct'
  ELSE 'Other'
END
`;

// Portals that produce listing-syndication noise rather than owned-media leads.
// Excluded from analytics so source breakdowns reflect channels the marketing
// team actually invests in.
const PORTAL_EXCLUSION_LIST = `(
  'PF','Property Finder Premium','Pf Property',
  'Bayut','Dubizzle','LRE','Propsearch',
  'Just Property','Just Rentals','Justproperty.com','Justproperty Featured','Justproperty Promoted',
  'Houza','Zoom Property','7 Days',
  'Yalla Deals','Yalladeals',
  'Propertytrader.ae','Aswat','Airbnb.com',
  'Prop Search','Getthat','Getthat.com',
  'Propspace Network','Propspace Mls',
  'Propertyonline.ae','Propertyinc.com','Property Inc.',
  'Gnproperty.com','Waseet.com','Prop.ae',
  'Yzer Property','Yzer.com','Hut.ae',
  'Abudhabi.classonet.com','Iwannaproperty.com',
  'James Edition','Simsari','Www.propertyportal.ae',
  'Other Portal','Multiple Portals',
  'Locanto','Propertywifi.com','Whatpricemyhome'
)`;

// Returns the analytical column set for /analytics. Heavy GROUP_CONCAT text
// columns (lead_notes, customer_communication, agent_change_log) are excluded
// to keep the response payload manageable — those are useful for per-lead
// drilldowns but blow up at ~92K rows. PII (customer name/email/phone, agent
// contact details, tracking links) is also excluded since the analytics
// frontend doesn't display per-lead detail.
//
// `since` is an ISO date (YYYY-MM-DD).
export function buildLeadsAnalyticsSql(since: string): string {
  const safeSince = since.replace(/[^0-9-]/g, ''); // strict date format
  return `
WITH src AS (
  SELECT id, ${SOURCE_BUCKET} AS source_bucket
  FROM leads
  WHERE created_at >= '${safeSince}'
),
lead_camp AS (
  SELECT lc.lead_id,
    GROUP_CONCAT(DISTINCT c.id        ORDER BY c.id SEPARATOR ' | ') AS campaign_ids,
    GROUP_CONCAT(DISTINCT c.reference ORDER BY c.id SEPARATOR ' | ') AS campaign_codes,
    GROUP_CONCAT(DISTINCT c.name      ORDER BY c.id SEPARATOR ' | ') AS campaign_names
  FROM lead_campaigns lc
  JOIN campaigns c ON c.id = lc.campaign_id
  JOIN leads l ON l.id = lc.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY lc.lead_id
),
lead_comments AS (
  SELECT cm.commentable_id AS lead_id,
    COUNT(*)            AS lead_notes_count,
    MIN(cm.created_at)  AS first_note_at,
    MAX(cm.created_at)  AS last_note_at
  FROM comments cm
  JOIN leads l ON l.id = cm.commentable_id AND l.created_at >= '${safeSince}'
  WHERE cm.commentable_type = 'Lead'
  GROUP BY cm.commentable_id
),
customer_comm AS (
  SELECT cch.resource_id AS lead_id,
    COUNT(*)                            AS customer_comm_count,
    SUM(cch.direction = 'Incoming')     AS incoming_count,
    SUM(cch.direction = 'Outgoing')     AS outgoing_count,
    SUM(cch.successful = 1)             AS successful_contacts,
    SUM(cch.type = 'Phone')             AS phone_attempts,
    SUM(cch.type = 'Email')             AS email_attempts,
    SUM(cch.type = 'WhatsApp')          AS whatsapp_attempts,
    MIN(cch.created_at)                 AS first_comm_at,
    MAX(cch.created_at)                 AS last_comm_at
  FROM customer_contact_histories cch
  JOIN leads l ON l.id = cch.resource_id AND l.created_at >= '${safeSince}'
  WHERE cch.resource_type = 'Lead'
  GROUP BY cch.resource_id
),
agent_history AS (
  SELECT al.subject_id AS lead_id,
    COUNT(*)            AS agent_reassignment_count,
    MIN(al.created_at)  AS first_agent_change_at,
    MAX(al.created_at)  AS last_agent_change_at
  FROM activity_log al
  JOIN leads l ON l.id = al.subject_id AND l.created_at >= '${safeSince}'
  WHERE al.subject_type = 'Lead'
    AND (
      al.event IN ('reassign','reassigned')
      OR (
        al.event = 'updated'
        AND JSON_EXTRACT(al.properties, '$.attributes.agent_id') IS NOT NULL
        AND JSON_EXTRACT(al.properties, '$.old.agent_id')        IS NOT NULL
        AND JSON_EXTRACT(al.properties, '$.attributes.agent_id')
         <> JSON_EXTRACT(al.properties, '$.old.agent_id')
      )
    )
  GROUP BY al.subject_id
),
acts AS (
  SELECT a.lead_id,
    SUM(a.type='Qualification')                    AS qualifications,
    SUM(a.type='Valuation')                        AS valuations,
    SUM(a.type='Viewing' AND a.status='Scheduled') AS viewings_scheduled,
    SUM(a.type='Viewing' AND a.status='Completed') AS viewings_completed,
    SUM(a.type='Offer')                            AS offers,
    SUM(a.type='Price Change')                     AS price_changes,
    COUNT(*)                                       AS total_activities,
    MIN(a.datetime)                                AS first_activity_at,
    MAX(a.datetime)                                AS last_activity_datetime
  FROM activities a
  JOIN leads l ON l.id = a.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY a.lead_id
),
deal_out AS (
  SELECT d.lead_id,
    MAX(d.reference)                      AS deal_reference,
    MAX(d.type)                           AS deal_type,
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
lead_req AS (
  SELECT lr.lead_id,
    COUNT(DISTINCT lr.listing_id) AS listings_enquired
  FROM lead_requirements lr
  JOIN leads l ON l.id = lr.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY lr.lead_id
)
SELECT
  -- Identity
  l.id                                                    AS lead_id,
  l.reference                                             AS lead_reference,
  l.created_at                                            AS lead_created_at,
  l.updated_at                                            AS lead_last_updated_at,
  -- Customer (id only, no PII)
  c.id                                                    AS customer_id,
  -- Classification
  l.type                                                  AS client_type,
  l.status                                                AS current_stage,
  l.state                                                 AS lead_state,
  l.score                                                 AS lead_score,
  l.purpose,
  -- Source / channel
  src.source_bucket                                       AS canonical_source,
  l.enquiry_source                                        AS raw_source,
  l.enquiry_method,
  l.contact_method,
  l.input_source,
  l.is_wa_chat                                            AS is_whatsapp_chat,
  -- UTM
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.source')),  'null') AS utm_source,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.medium')),  'null') AS utm_medium,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')),'null') AS utm_campaign,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.term')),    'null') AS utm_term,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.content')), 'null') AS utm_content,
  -- Internal Engage campaign code (assigned by the marketing team in
  -- lead_campaigns ↔ campaigns.reference). Independent of utm_campaign —
  -- one internal code can have many UTM variants across ads. A lead can be
  -- tagged with multiple internal codes; we take the first one for the
  -- single-value filter, full list stays in internal_campaign_codes.
  SUBSTRING_INDEX(lc.campaign_codes, ' | ', 1)             AS campaign_code,
  lc.campaign_ids                                          AS internal_campaign_ids,
  lc.campaign_codes                                        AS internal_campaign_codes,
  lc.campaign_names                                        AS internal_campaign_names,
  -- Agent / org (id + display name only)
  u.id                                                    AS current_agent_id,
  u.name                                                  AS current_agent_name,
  u.status                                                AS current_agent_status,
  br.name                                                 AS branch,
  dv.name                                                 AS division,
  -- Agent reassignment summary (count + bounds, log excluded for payload size)
  COALESCE(ah.agent_reassignment_count, 0)                AS agent_reassignment_count,
  ah.first_agent_change_at,
  ah.last_agent_change_at,
  -- Funnel — acquisition (6 canonical stages from your reference query)
  1                                                       AS stage_1_lead_received,
  CASE WHEN COALESCE(acts.qualifications,0) > 0
        OR l.status IN ('Qualified','Viewing','Offer','Reserved','Deal','Valuation','Listed')
       THEN 1 ELSE 0 END                                  AS stage_2_qualified,
  -- Supply-side stages (Landlord/Seller) — kept so the Supply funnel chart still works
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
  -- Responsiveness — counts and timestamps, no text aggregations
  COALESCE(cc.customer_comm_count,0)                      AS customer_comm_count,
  COALESCE(cc.incoming_count,0)                           AS incoming_contacts,
  COALESCE(cc.outgoing_count,0)                           AS outgoing_contacts,
  COALESCE(cc.successful_contacts,0)                      AS successful_contacts,
  COALESCE(cc.phone_attempts,0)                           AS phone_attempts,
  COALESCE(cc.email_attempts,0)                           AS email_attempts,
  COALESCE(cc.whatsapp_attempts,0)                        AS whatsapp_attempts,
  COALESCE(acts.total_activities,0)                       AS total_activities,
  acts.first_activity_at,
  acts.last_activity_datetime,
  -- First / last touch — earliest/latest signal across activities, comms, and notes
  NULLIF(LEAST(
    IFNULL(acts.first_activity_at,'9999-12-31'),
    IFNULL(cc.first_comm_at,      '9999-12-31'),
    IFNULL(lcm.first_note_at,     '9999-12-31')
  ), '9999-12-31')                                        AS first_touch_at,
  CASE
    WHEN LEAST(
           IFNULL(acts.first_activity_at,'9999-12-31'),
           IFNULL(cc.first_comm_at,      '9999-12-31'),
           IFNULL(lcm.first_note_at,     '9999-12-31')
         ) = '9999-12-31' THEN NULL
    ELSE TIMESTAMPDIFF(HOUR, l.created_at, LEAST(
           IFNULL(acts.first_activity_at,'9999-12-31'),
           IFNULL(cc.first_comm_at,      '9999-12-31'),
           IFNULL(lcm.first_note_at,     '9999-12-31')))
  END                                                     AS hours_to_first_touch,
  NULLIF(GREATEST(
    IFNULL(acts.last_activity_datetime,'1970-01-01'),
    IFNULL(cc.last_comm_at,             '1970-01-01'),
    IFNULL(lcm.last_note_at,            '1970-01-01'),
    IFNULL(l.last_activity_at,          '1970-01-01')
  ), '1970-01-01')                                        AS last_touch_at,
  CASE
    WHEN GREATEST(
           IFNULL(acts.last_activity_datetime,'1970-01-01'),
           IFNULL(cc.last_comm_at,             '1970-01-01'),
           IFNULL(lcm.last_note_at,            '1970-01-01'),
           IFNULL(l.last_activity_at,          '1970-01-01')
         ) = '1970-01-01' THEN NULL
    ELSE DATEDIFF(NOW(), GREATEST(
           IFNULL(acts.last_activity_datetime,'1970-01-01'),
           IFNULL(cc.last_comm_at,             '1970-01-01'),
           IFNULL(lcm.last_note_at,            '1970-01-01'),
           IFNULL(l.last_activity_at,          '1970-01-01')))
  END                                                     AS days_since_last_touch,
  CASE
    WHEN COALESCE(acts.total_activities,0)=0
     AND COALESCE(cc.customer_comm_count,0)=0
     AND COALESCE(lcm.lead_notes_count,0)=0          THEN 'NEVER_TOUCHED'
    WHEN l.state = 'Open'
     AND GREATEST(
            IFNULL(acts.last_activity_datetime,'1970-01-01'),
            IFNULL(cc.last_comm_at,             '1970-01-01'),
            IFNULL(lcm.last_note_at,            '1970-01-01')
         ) = '1970-01-01'                                 THEN 'NEVER_TOUCHED'
    WHEN l.state = 'Open'
     AND DATEDIFF(NOW(), GREATEST(
            IFNULL(acts.last_activity_datetime,'1970-01-01'),
            IFNULL(cc.last_comm_at,             '1970-01-01'),
            IFNULL(lcm.last_note_at,            '1970-01-01')
         )) > 7                                       THEN 'STALE_>7D'
    WHEN l.state = 'Open'
     AND DATEDIFF(NOW(), GREATEST(
            IFNULL(acts.last_activity_datetime,'1970-01-01'),
            IFNULL(cc.last_comm_at,             '1970-01-01'),
            IFNULL(lcm.last_note_at,            '1970-01-01')
         )) > 3                                       THEN 'COOLING_>3D'
    WHEN l.state = 'Closed'                           THEN 'CLOSED'
    WHEN l.state = 'Completed'                        THEN 'COMPLETED'
    ELSE 'ACTIVE'
  END                                                     AS responsiveness_flag,
  COALESCE(lcm.lead_notes_count,0)                        AS lead_notes_count,
  -- Listings
  lr.listings_enquired,
  -- Conversion outcome
  CASE
    WHEN dl.deal_closed_at IS NOT NULL                          THEN 'Closed'
    WHEN dl.deal_status   IN ('Reserved','In Review','Draft')   THEN 'In Deal'
    WHEN l.status         IN ('Reserved','Deal')                THEN 'Reserved'
    ELSE 'Not Converted'
  END                                                     AS conversion_status,
  dl.deal_reference,
  dl.deal_type,
  dl.deal_status,
  dl.deal_final_price,
  dl.deal_commission,
  dl.deal_reserved_at,
  dl.deal_closed_at
FROM leads l
LEFT JOIN customers      c   ON c.id  = l.customer_id
LEFT JOIN users          u   ON u.id  = l.agent_id
LEFT JOIN branches       br  ON br.id = u.branch_id
LEFT JOIN divisions      dv  ON dv.id = l.division_id
LEFT JOIN src                ON src.id   = l.id
LEFT JOIN lead_camp      lc  ON lc.lead_id  = l.id
LEFT JOIN lead_comments  lcm ON lcm.lead_id = l.id
LEFT JOIN customer_comm  cc  ON cc.lead_id  = l.id
LEFT JOIN agent_history  ah  ON ah.lead_id  = l.id
LEFT JOIN acts               ON acts.lead_id = l.id
LEFT JOIN deal_out       dl  ON dl.lead_id  = l.id
LEFT JOIN lead_req       lr  ON lr.lead_id  = l.id
WHERE l.created_at >= '${safeSince}'
  AND (l.enquiry_source IS NULL
       OR l.enquiry_source NOT IN ${PORTAL_EXCLUSION_LIST})
ORDER BY l.created_at DESC
`;
}

// Aggregate: qualified-lead count grouped by unified campaign code
// (UTM utm.campaign preferred, falls back to internal campaigns.reference).
// Used to refresh paid_assignments.qualified_leads. Portal-syndication leads
// are excluded to match the analytics query.
export function buildQualifiedRollupSql(since: string): string {
  const safeSince = since.replace(/[^0-9-]/g, '');
  return `
WITH lead_camp AS (
  SELECT lc.lead_id,
    SUBSTRING_INDEX(
      GROUP_CONCAT(DISTINCT c.reference ORDER BY c.id SEPARATOR ' | '),
      ' | ', 1
    ) AS internal_code
  FROM lead_campaigns lc
  JOIN campaigns c ON c.id = lc.campaign_id
  JOIN leads l ON l.id = lc.lead_id AND l.created_at >= '${safeSince}'
  GROUP BY lc.lead_id
)
SELECT
  TRIM(COALESCE(
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')), 'null'),
    lcamp.internal_code
  )) AS campaign_code,
  SUM(
    CASE WHEN l.status IN ('Qualified','Viewing','Offer','Reserved','Deal','Valuation','Listed')
              OR EXISTS (
                SELECT 1 FROM activities a
                WHERE a.lead_id = l.id AND a.type IN ('Qualification','Valuation'))
         THEN 1 ELSE 0 END
  ) AS qualified_leads
FROM leads l
LEFT JOIN lead_camp lcamp ON lcamp.lead_id = l.id
WHERE l.created_at >= '${safeSince}'
  AND (l.enquiry_source IS NULL OR l.enquiry_source NOT IN ${PORTAL_EXCLUSION_LIST})
  AND COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')), 'null'),
        lcamp.internal_code
      ) IS NOT NULL
GROUP BY TRIM(COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(l.utm,'$.campaign')), 'null'),
  lcamp.internal_code
))
HAVING campaign_code IS NOT NULL AND campaign_code <> ''
`;
}
