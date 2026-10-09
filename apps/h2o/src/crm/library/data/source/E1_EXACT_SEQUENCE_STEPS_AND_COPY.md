# Exact E1 Sequence Step and Copy Appendix

Generated mechanically from the selected frozen `sequence_library.json` and `sequence_steps.json`. Timings are original contract text, not approved send dates. This is review material, not an activated campaign.

## ICS_EMAIL_REVENUE_E1_1_RFQ_QUOTE_SEQUENCE_LIBRARY_2026-09-13_R2

| Sequence | Step count |
|---|---:|
| `ICS_RFQ_RECEIPT_FIRST_RESPONSE` | 2 |
| `ICS_RFQ_QUALIFICATION_FOLLOWUP` | 3 |
| `ICS_MISSING_INFORMATION` | 3 |
| `ICS_ENGINEERING_SPEC_FOLLOWUP` | 2 |
| `ICS_QUOTE_PROPOSAL_FOLLOWUP` | 5 |
| `ICS_DELAYED_PROJECT_FOLLOWUP` | 3 |
| `ICS_DORMANT_OPPORTUNITY_RECOVERY` | 3 |
| `ICS_REBID_REVISED_SCOPE_REENTRY` | 2 |
| `ICS_NO_DECISION_CLOSEOUT` | 2 |

### ICS_RFQ_RECEIPT_FIRST_RESPONSE / 1 / ACK_PERSISTED_RFQ

**Type:** EMAIL  
**Timing:** IMMEDIATE_AFTER_PERSISTENCE  
**Approval:** REQUIRED

**Subject Variants**

- RFQ received by ICS

- We received your RFQ

**Copy Variants**

- Hi {{first_name}}, we received your RFQ {{rfq_reference}} and it is now logged with our team. We will use the information you submitted as the starting point and only ask for details that are needed to evaluate the project. If there is a bid date, outage window, or construction schedule we should work around, reply here and let us know. - Rhonda

- Hi {{first_name}}, your RFQ {{rfq_reference}} has been received and saved with our team. We are reviewing the submitted scope rather than asking you to repeat it. We will use the information already provided as the working record. If there is a deadline, outage window, or construction date that should guide the review, reply here with that timing. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

**Required Evidence Fields**

- rfq_id

- rfq_persisted_at

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Any genuine human reply activates contact conversation lock and owner task before another generic automated message can qualify.

**Task Creation**

Create/retain HIGH_PRIORITY_RFQ_RESPONSE task for assigned owner; target same business day; no automatic commitment to a specific SLA in customer copy.

**Ai Skeleton**

Confirm durable receipt of {{rfq_reference}}. State that submitted information is the starting point. Ask only for a verified schedule/bid timing if the recipient wants to add it. Do not add capabilities, promises, or technical conclusions.


### ICS_RFQ_RECEIPT_FIRST_RESPONSE / 2 / OWNER_FIRST_RESPONSE_TASK

**Type:** TASK  
**Timing:** IMMEDIATE  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Review RFQ, confirm fit/urgency, inspect supplied documents, and send human response or classify missing information.


### ICS_RFQ_QUALIFICATION_FOLLOWUP / 1 / QUALIFY_COMMERCIAL_MOTION

**Type:** EMAIL  
**Timing:** NEXT_BUSINESS_DAY_IF_UNRESOLVED  
**Approval:** REQUIRED

**Subject Variants**

- One RFQ question

- RFQ scope question

**Copy Variants**

- Hi {{first_name}}, I am reviewing {{rfq_reference}} and want to make sure we route it correctly. Can you confirm whether the request is for a new tower, rebuild/replacement, repair, upgrade, maintenance/inspection, or parts? If that is already clear in the submitted documents, no need to repeat it; we will use the verified project information already on file. - Rhonda

- Hi {{first_name}}, one routing question on {{rfq_reference}}. Is the current need a new industrial cooling tower, a rebuild/replacement, repair, upgrade, maintenance/inspection, or parts? If the documents already make that clear, you do not need to send it again. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

**Required Evidence Fields**

- rfq_id

- qualification_state

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply classified and locked. Update RFQ qualification state only from explicit reply or human review.

**Task Creation**

Create QUALIFY_RFQ task on reply or if no response after sequence window.

**Ai Skeleton**

Ask exactly one unresolved routing question. Use only approved commercial-motion labels. Acknowledge that existing submitted documents remain authoritative.


### ICS_RFQ_QUALIFICATION_FOLLOWUP / 2 / QUALIFICATION_REMINDER

**Type:** EMAIL  
**Timing:** 3_BUSINESS_DAYS_AFTER_STEP_1  
**Approval:** REQUIRED

**Subject Variants**

- RFQ routing follow-up

- Still one open question

**Copy Variants**

- Hi {{first_name}}, the routing question on {{rfq_reference}} is still open on our side. If the scope is already clear in the documents, no action is needed. Otherwise, a short reply with the project type is enough and we will update the RFQ. - Rhonda

- Hi {{first_name}}, I do not want to ask for information you already sent. If {{rfq_reference}} still needs a project-type label on our side, a short reply with new tower, rebuild, repair, upgrade, maintenance, or parts is enough. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

**Required Evidence Fields**

- rfq_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply activates lock and qualification task.

**Task Creation**

On reply create QUALIFY_RFQ_FROM_REPLY; otherwise route to human review after final step.

**Ai Skeleton**

Short reminder. Do not claim urgency. Do not add a second question. State that no response is needed if the documents already answer it.


### ICS_RFQ_QUALIFICATION_FOLLOWUP / 3 / QUALIFICATION_HUMAN_REVIEW

**Type:** TASK  
**Timing:** 7_BUSINESS_DAYS_AFTER_STEP_1  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Human review: classify using submitted RFQ documents, request information manually if material, or mark qualification unknown without guessing.


### ICS_MISSING_INFORMATION / 1 / REQUEST_MISSING_INFO

**Type:** EMAIL  
**Timing:** IMMEDIATE_AFTER_VALIDATED_MISSING_INFO_STATE  
**Approval:** REQUIRED

**Subject Variants**

- A few RFQ details

- Items needed for review

**Copy Variants**

- Hi {{first_name}}, we are reviewing {{rfq_reference}}. The only items still needed on our side are {{missing_information_list}}. We are not asking you to resend anything already provided. If those items are available, reply with them or attach the current specification or drawings and we can continue the review. - Rhonda

- Hi {{first_name}}, for {{rfq_reference}}, we have the submitted material and are missing only {{missing_information_list}}. If you have those items, reply here or attach the current document set. We will use what you already sent and avoid duplicating requests. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

- missing_information_list

**Required Evidence Fields**

- rfq_id

- missing_information_fields

- missing_info_validation_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks sequence and routes attachments/details to owner.

**Task Creation**

Create REVIEW_RFQ_NEW_INFORMATION task with references to inbound message and attachments.

**Ai Skeleton**

Use a validated list of missing fields. Never add inferred technical requirements. Mention that existing submitted material remains authoritative. One reply CTA.


### ICS_MISSING_INFORMATION / 2 / MISSING_INFO_REMINDER

**Type:** EMAIL  
**Timing:** 3_BUSINESS_DAYS_AFTER_STEP_1  
**Approval:** REQUIRED

**Subject Variants**

- RFQ details still open

- Missing RFQ information

**Copy Variants**

- Hi {{first_name}}, a quick note on {{rfq_reference}}: we are still missing {{missing_information_list}}. If the project timing has changed or those details are not available yet, a short reply with the current status is enough and we will update our side. - Rhonda

- Hi {{first_name}}, we still have {{missing_information_list}} open for {{rfq_reference}}. If those items are not available yet, just let me know the project status and we will hold the review rather than keep asking for the same information. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

- missing_information_list

**Required Evidence Fields**

- rfq_id

- missing_information_fields

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks; NOT_NOW pauses; supplied info creates review task.

**Task Creation**

Create REVIEW_RFQ_NEW_INFORMATION or PROJECT_STATUS task according to reply classification.

**Ai Skeleton**

Reminder limited to the same validated missing fields. Offer a status reply instead of repeated pressure.


### ICS_MISSING_INFORMATION / 3 / MISSING_INFO_HOLD

**Type:** TASK  
**Timing:** 7_BUSINESS_DAYS_AFTER_STEP_1  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Pause for human review. Decide whether to hold, close as incomplete, or contact manually based on project value/timing. Never auto-classify lost.


### ICS_ENGINEERING_SPEC_FOLLOWUP / 1 / ENGINEERING_OPEN_ITEM

**Type:** EMAIL  
**Timing:** IMMEDIATE_AFTER_APPROVED_OPEN_ITEM  
**Approval:** REQUIRED

**Subject Variants**

- One technical item

- Technical question on RFQ

**Copy Variants**

- Hi {{first_name}}, our review of {{rfq_reference}} has one open technical item: {{verified_open_technical_item}}. Can you confirm {{verified_question}}? Once we have that, the team can continue with the current review rather than making an assumption about the project. - Rhonda

- Hi {{first_name}}, there is one technical point we need to close on {{rfq_reference}}: {{verified_open_technical_item}}. Can you confirm {{verified_question}}? We will use your answer and the submitted documents rather than infer the missing detail. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

- verified_open_technical_item

- verified_question

**Required Evidence Fields**

- open_item_id

- evidence_ids

- approved_question_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Any reply locks and creates engineering review task.

**Task Creation**

Create ENGINEERING_REVIEW_REPLY task with evidence links.

**Ai Skeleton**

State exactly one verified open technical item and one approved question. Never generate a technical conclusion, required answer, capacity, material, or suitability claim.


### ICS_ENGINEERING_SPEC_FOLLOWUP / 2 / ENGINEERING_OPEN_ITEM_REMINDER

**Type:** EMAIL  
**Timing:** 5_BUSINESS_DAYS_AFTER_STEP_1  
**Approval:** REQUIRED

**Subject Variants**

- Technical item still open

- RFQ technical follow-up

**Copy Variants**

- Hi {{first_name}}, the technical item on {{rfq_reference}} is still open on our side: {{verified_open_technical_item}}. If the answer is not available yet, a timing update is enough and we will hold the review rather than assume the missing information. - Rhonda

- Hi {{first_name}}, following up only on the open item for {{rfq_reference}}: {{verified_open_technical_item}}. If your team is still working through it, let me know and we will keep the RFQ on hold until the information is ready. - Rhonda

**Required Crm Placeholders**

- first_name

- rfq_reference

- verified_open_technical_item

**Required Evidence Fields**

- open_item_id

- evidence_ids

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks. NOT_NOW/technical pending sets hold state.

**Task Creation**

Create ENGINEERING_REVIEW_REPLY or HOLD_RFQ task.

**Ai Skeleton**

Repeat only the same verified open item. Do not add urgency or technical inference.


### ICS_QUOTE_PROPOSAL_FOLLOWUP / 1 / QUOTE_TRANSMITTAL

**Type:** EMAIL  
**Timing:** WHEN_QUOTE_APPROVED_FOR_DELIVERY_IF_ENGINE_SENDS_TRANSMITTAL; OTHERWISE_SKIP  
**Approval:** REQUIRED

**Subject Variants**

- ICS proposal for review

- Current proposal version

**Copy Variants**

- Hi {{first_name}}, attached is the current ICS proposal {{quote_reference}} for {{verified_scope_label}}. Please use this version for your team's review. If anything is missing on the technical, scope, documentation, or scheduling side, reply here and we'll coordinate the right response. I can also route any question to the appropriate person on our side. - Rhonda

- Hi {{first_name}}, I am sending the current ICS proposal {{quote_reference}} for {{verified_scope_label}}. This is the version our team has recorded for review. If your team needs a technical clarification, scope change, supporting document, or scheduling update, reply here and we will coordinate it. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

- verified_scope_label

**Required Evidence Fields**

- quote_id

- version_number

- scope_evidence_id

- recipient_contact_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply activates contact/account conversation lock as configured and routes to owner.

**Task Creation**

Create QUOTE_REPLY_REVIEW task.

**Ai Skeleton**

Transmit only the verified current quote/proposal reference and approved scope label. Do not summarize price, performance, savings, or technical suitability unless separately approved and evidence-backed.


### ICS_QUOTE_PROPOSAL_FOLLOWUP / 2 / CONFIRM_QUOTE_RECEIPT

**Type:** EMAIL  
**Timing:** 2_BUSINESS_DAYS_AFTER_QUOTE_SENT  
**Approval:** REQUIRED

**Subject Variants**

- Did the proposal arrive

- Proposal receipt check

**Copy Variants**

- Hi {{first_name}}, wanted to confirm {{quote_reference}} reached you. Is anything missing on the technical or scheduling side before your team reviews it? If another person should receive the current version, let me know and we will route it correctly. - Rhonda

- Hi {{first_name}}, a quick receipt check on {{quote_reference}}. Did the current proposal reach the right people on your side? If a technical document or another copy is needed for the review, reply here and we will send the correct item. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

**Required Evidence Fields**

- quote_id

- version_number

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Any reply locks. Referral creates routing task; request information creates response task.

**Task Creation**

Create QUOTE_RECEIPT_OR_ROUTING task according to reply.

**Ai Skeleton**

Confirm receipt and correct routing. Do not use tracking-open data as proof of receipt. One useful question maximum.


### ICS_QUOTE_PROPOSAL_FOLLOWUP / 3 / TECHNICAL_GAP_CHECK

**Type:** EMAIL  
**Timing:** 7_CALENDAR_DAYS_AFTER_QUOTE_SENT_OR_NEXT_BUSINESS_DAY  
**Approval:** REQUIRED

**Subject Variants**

- Any technical gaps

- Proposal technical review

**Copy Variants**

- Hi {{first_name}}, before your team gets too far into the review, is there any technical point, scope item, or assumption in {{quote_reference}} that needs clarification? If so, reply with the item and we will coordinate the right engineering response. - Rhonda

- Hi {{first_name}}, one useful check on {{quote_reference}}: is there anything in the technical scope that your team wants clarified before the commercial review moves further? A short reply with the item is enough and we will route it correctly. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

**Required Evidence Fields**

- quote_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Technical reply creates lock and engineering task.

**Task Creation**

Create QUOTE_TECHNICAL_QUESTION task.

**Ai Skeleton**

Ask whether the recipient has a technical/scope question. Do not guess what the gap is. Do not introduce new claims.


### ICS_QUOTE_PROPOSAL_FOLLOWUP / 4 / SCHEDULE_PROCUREMENT_CHECK

**Type:** EMAIL  
**Timing:** 14_CALENDAR_DAYS_AFTER_QUOTE_SENT_OR_NEXT_BUSINESS_DAY  
**Approval:** REQUIRED

**Subject Variants**

- Project timing check

- Proposal schedule question

**Copy Variants**

- Hi {{first_name}}, one project-planning question on {{quote_reference}}: has the expected bid, award, outage, or construction schedule changed since we sent it? If it has, send the current timing and we will keep our side aligned with the project. - Rhonda

- Hi {{first_name}}, I want to keep the timing on {{quote_reference}} accurate. Has the procurement or project schedule moved since the proposal was issued? If so, a short timing update is enough and we will keep our timing aligned. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

**Required Evidence Fields**

- quote_id

- opportunity_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks and updates schedule only from explicit customer information.

**Task Creation**

Create PROJECT_SCHEDULE_UPDATE task.

**Ai Skeleton**

Ask one timing/status question using only fields relevant to the project. Do not invent deadlines.


### ICS_QUOTE_PROPOSAL_FOLLOWUP / 5 / DAY30_STATUS_CLASSIFICATION

**Type:** EMAIL  
**Timing:** 30_CALENDAR_DAYS_AFTER_QUOTE_SENT_OR_PROJECT_SPECIFIC_STAGE_WINDOW  
**Approval:** REQUIRED

**Subject Variants**

- Current project status

- Proposal status update

**Copy Variants**

- Hi {{first_name}}, I want to keep the status on {{quote_reference}} accurate. Is the project still active, delayed, being rebid, changed in scope, or no longer moving forward? A short reply is enough, and we will update our side accordingly. - Rhonda

- Hi {{first_name}}, we still have {{quote_reference}} open and I do not want to keep sending generic follow-ups. Is the project active, delayed, rebid, changed in scope, or no longer moving forward? A short status reply is enough. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

**Required Evidence Fields**

- quote_id

- opportunity_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply classification maps ACTIVE/DELAYED/REBID/SCOPE_CHANGED/NO_DECISION/LOST only when explicit or human-reviewed.

**Task Creation**

Create QUOTE_STATUS_CLASSIFICATION task on reply or no-response.

**Ai Skeleton**

Request a status classification. Never auto-mark LOST from non-response. No-response after this step routes to human review/dormant policy.


### ICS_DELAYED_PROJECT_FOLLOWUP / 1 / DELAYED_REVIEW_DATE_CHECK

**Type:** EMAIL  
**Timing:** AT_VERIFIED_NEXT_REVIEW_AT  
**Approval:** REQUIRED

**Subject Variants**

- Project timing update

- Delayed project check

**Copy Variants**

- Hi {{first_name}}, when we last updated {{quote_reference}}, the project was marked delayed until around {{verified_next_review_date}}. Has the schedule or scope changed since then? If not, no problem - a brief timing update is enough and we will keep the record aligned. - Rhonda

- Hi {{first_name}}, I am checking {{quote_reference}} at the review date recorded for the delayed project. Has the project timing or scope moved again? A short update is enough and we will adjust the next follow-up rather than keep contacting you at the wrong time. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

- verified_next_review_date

**Required Evidence Fields**

- opportunity_id

- next_review_at

- delay_event_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks. NOT_NOW sets new review date only from explicit reply/human action.

**Task Creation**

Create DELAYED_PROJECT_STATUS task.

**Ai Skeleton**

Reference only the verified delayed status and review date. Ask for schedule/scope update without pressure.


### ICS_DELAYED_PROJECT_FOLLOWUP / 2 / DELAYED_SECOND_CHECK

**Type:** EMAIL  
**Timing:** 30_CALENDAR_DAYS_AFTER_STEP_1_IF_NO_STATUS  
**Approval:** REQUIRED

**Subject Variants**

- Keep this on hold

- Project review timing

**Copy Variants**

- Hi {{first_name}}, one last timing check on {{quote_reference}}. If the project is still delayed, tell me the month or milestone that makes sense for us to revisit it. If there is no useful date yet, we can keep it on hold without repeated follow-ups. - Rhonda

- Hi {{first_name}}, I do not want to keep checking {{quote_reference}} on the wrong schedule. If the project is still delayed, a rough month or milestone is enough for us to set the next review. Otherwise we will leave it on hold. - Rhonda

**Required Crm Placeholders**

- first_name

- quote_reference

**Required Evidence Fields**

- opportunity_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks; NOT_NOW/HOLD updates after human review.

**Task Creation**

Create DELAYED_PROJECT_HOLD task.

**Ai Skeleton**

One timing question; no urgency. If no useful date is supplied, stop automated follow-up and route to hold.


### ICS_DELAYED_PROJECT_FOLLOWUP / 3 / DELAYED_LONG_HOLD_REVIEW

**Type:** TASK  
**Timing:** 90_CALENDAR_DAYS_AFTER_STEP_2_OR_OWNER_SET_DATE  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Human review strategic value, current account context, and whether another follow-up is appropriate.


### ICS_DORMANT_OPPORTUNITY_RECOVERY / 1 / DORMANT_STATUS_CHECK

**Type:** EMAIL  
**Timing:** ON_RECOVERY_ELIGIBILITY  
**Approval:** REQUIRED

**Subject Variants**

- Still active or delayed

- Project status check

**Copy Variants**

- Hi {{first_name}}, we still have {{opportunity_reference}} open on our side, but there has not been recent activity. Is the project active, delayed, being rebid, changed in scope, or no longer moving forward? A short status reply is enough and we will update the opportunity correctly. - Rhonda

- Hi {{first_name}}, I am reviewing older open items and {{opportunity_reference}} is still active in our system. Is it still moving, delayed, changed in scope, rebid, or something we should close for now? A short reply is enough. - Rhonda

**Required Crm Placeholders**

- first_name

- opportunity_reference

**Required Evidence Fields**

- opportunity_id

- last_meaningful_activity_at

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Any human reply locks and drives explicit status task.

**Task Creation**

Create DORMANT_STATUS_REVIEW task.

**Ai Skeleton**

Ask for current status. Avoid saying prior customer/project history beyond the verified opportunity reference.


### ICS_DORMANT_OPPORTUNITY_RECOVERY / 2 / DORMANT_CLOSE_OR_REVISIT

**Type:** EMAIL  
**Timing:** 21_CALENDAR_DAYS_AFTER_STEP_1  
**Approval:** REQUIRED

**Subject Variants**

- Close or revisit later

- When should we revisit

**Copy Variants**

- Hi {{first_name}}, I do not want to keep sending follow-ups if the timing is no longer right. Should we close {{opportunity_reference}} for now, or is there a later month when it would be useful to reconnect? A short reply is enough. - Rhonda

- Hi {{first_name}}, one final status question on {{opportunity_reference}}. If the project is not active now, should we close it for the moment or set a later review month? We will follow the timing you give us. - Rhonda

**Required Crm Placeholders**

- first_name

- opportunity_reference

**Required Evidence Fields**

- opportunity_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks; later month becomes proposed review date pending human validation.

**Task Creation**

Create CLOSE_OR_REVISIT task.

**Ai Skeleton**

Give respectful close-or-revisit choice. No pressure, discounts, urgency, or claims.


### ICS_DORMANT_OPPORTUNITY_RECOVERY / 3 / DORMANT_FINAL_HUMAN_REVIEW

**Type:** TASK  
**Timing:** 90_CALENDAR_DAYS_AFTER_STEP_2  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Human decides HOLD, NO_DECISION, LOST only with evidence, or future review. Preserve uncertainty if status is unknown.


### ICS_REBID_REVISED_SCOPE_REENTRY / 1 / ACK_REVISED_SCOPE

**Type:** EMAIL  
**Timing:** IMMEDIATE_AFTER_REVISED_SCOPE_PERSISTENCE_AND_HUMAN_REVIEW  
**Approval:** REQUIRED

**Subject Variants**

- Revised scope received

- Current revision received

**Copy Variants**

- Hi {{first_name}}, we received the revised scope for {{opportunity_reference}} and will treat it as a new controlled revision rather than assuming the previous version still applies. If there is one date or requirement that changed most materially, reply with it and we will make sure it is visible in the review. - Rhonda

- Hi {{first_name}}, the revised material for {{opportunity_reference}} is now recorded with our team. We will review the current version against the prior scope instead of carrying old assumptions forward. If one change is especially time-sensitive, reply with that item and we will flag it for review. - Rhonda

**Required Crm Placeholders**

- first_name

- opportunity_reference

**Required Evidence Fields**

- revision_id

- revision_reason

- prior_version_id

- current_version_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks and routes to revision review.

**Task Creation**

Create REVISED_SCOPE_REVIEW task with prior/current version references.

**Ai Skeleton**

Confirm receipt of revised scope and explicitly prevent stale-scope assumption. Do not summarize changes unless verified.


### ICS_REBID_REVISED_SCOPE_REENTRY / 2 / REVISED_SCOPE_OPEN_ITEMS

**Type:** EMAIL  
**Timing:** 3_BUSINESS_DAYS_AFTER_STEP_1_IF_VALIDATED_OPEN_ITEMS_EXIST  
**Approval:** REQUIRED

**Subject Variants**

- Revision items to confirm

- One revised-scope question

**Copy Variants**

- Hi {{first_name}}, the current revision for {{opportunity_reference}} has one open item: {{verified_open_revision_item}}. Can you confirm {{verified_question}}? We will use the current revision and your answer rather than carry the previous assumption forward. - Rhonda

- Hi {{first_name}}, one item remains open in the revised scope for {{opportunity_reference}}: {{verified_open_revision_item}}. Can you confirm {{verified_question}}? Once that is clear, the team can continue from the current version. - Rhonda

**Required Crm Placeholders**

- first_name

- opportunity_reference

- verified_open_revision_item

- verified_question

**Required Evidence Fields**

- revision_id

- open_item_id

- approved_question_id

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks and updates only from explicit answer.

**Task Creation**

Create REVISED_SCOPE_OPEN_ITEM task.

**Ai Skeleton**

Ask exactly one evidence-backed question about the current revision. Level 3 requires human approval.


### ICS_NO_DECISION_CLOSEOUT / 1 / NO_DECISION_REVIEW

**Type:** TASK  
**Timing:** IMMEDIATE  
**Approval:** See JSON

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Task Creation**

Review evidence. If status is explicit LOST/CANCELLED, exit. If genuinely NO_DECISION, optionally approve closeout email.


### ICS_NO_DECISION_CLOSEOUT / 2 / NO_DECISION_CLOSEOUT_EMAIL

**Type:** EMAIL  
**Timing:** AFTER_HUMAN_APPROVAL  
**Approval:** REQUIRED

**Subject Variants**

- Close this for now

- Project status before close

**Copy Variants**

- Hi {{first_name}}, I am cleaning up the status on {{opportunity_reference}} and do not want to keep following up without a reason. Should we close this as no decision for now, or is there a later point when the project should be reviewed again? A short reply is enough. - Rhonda

- Hi {{first_name}}, before we close {{opportunity_reference}} as no decision, is there a later month or project milestone when it would make sense to revisit it? If not, we will leave it closed until you contact us again. - Rhonda

**Required Crm Placeholders**

- first_name

- opportunity_reference

**Required Evidence Fields**

- opportunity_id

- status_reason

**Stop Conditions**

- tenant/contact suppression blocks the purpose

- contact hard bounce/invalid address

- tenant/domain/mailbox/sequence kill switch

- opportunity WON or explicitly LOST/CANCELLED where sequence no longer applies

**Pause Conditions**

- human reply received

- meeting scheduled

- revised scope/specification received

- new RFQ received

- active negotiation

- manual salesperson/account lock

- sending identity WATCH/THROTTLED/PAUSED/QUARANTINED when policy blocks send

**Reply Handling**

Reply locks. Explicit later timing creates review task; explicit no further contact creates suppression/closure flow as appropriate.

**Task Creation**

Create NO_DECISION_FINAL_STATUS task.

**Ai Skeleton**

Respectful closeout question. Do not imply loss to a competitor or cancellation unless explicitly known.

## ICS_EMAIL_REVENUE_E1_2_INSTALLED_BASE_SERVICE_PARTS_SEQUENCE_LIBRARY_2026-09-13_R1

| Sequence | Step count |
|---|---:|
| `ICS_INSTALLED_BASE_INSPECTION_MAINTENANCE` | 3 |
| `ICS_INSTALLED_BASE_REPAIR_CONDITION` | 3 |
| `ICS_INSTALLED_BASE_UPGRADE_MODERNIZATION` | 3 |
| `ICS_INSTALLED_BASE_REBUILD_REPLACEMENT` | 3 |
| `ICS_PARTS_TECHNICAL_FIT_SUPPORT` | 3 |
| `ICS_PARTS_RELATIONSHIP_REENGAGEMENT` | 3 |
| `ICS_SERVICE_RELATIONSHIP_REENGAGEMENT` | 3 |

### ICS_INSTALLED_BASE_INSPECTION_MAINTENANCE / 1 / MAINTENANCE_WINDOW_CHECK

**Type:** EMAIL  
**Timing:** AT_VERIFIED_SERVICE_WINDOW_TRIGGER  
**Approval:** REQUIRED

**Subject Variants**

- Tower inspection planning

- Maintenance window review

**Copy Variants**

- Hi {{first_name}}, I am checking in about {{verified_asset_label}} at {{verified_site_name}}. We have {{verified_service_window_phrase}} recorded for planning. Does your team want us to review inspection or maintenance scope for that window? If the timing has changed, reply with the updated schedule and I will make sure the follow-up reflects the information your team has provided. - Rhonda

- Hi {{first_name}}, I wanted to check the planning window we have for {{verified_asset_label}} at {{verified_site_name}}. Would it be useful for ICS to review the inspection or maintenance scope with your team? If the timing is different now, reply with the current window. I can route any technical question to the right person without assuming details that are not verified. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_asset_label

- verified_site_name

- verified_service_window_phrase

**Required Evidence Fields**

- asset_id

- site_id

- service_window_or_due_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

- explicit outage/urgent repair signal routes to human/repair precedence

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create INSPECTION_MAINTENANCE_REVIEW task on reply.

**Ai Skeleton**

Use only verified site/asset labels and an evidence-backed service-window phrase. Never say due/overdue unless due_at and basis are verified.


### ICS_INSTALLED_BASE_INSPECTION_MAINTENANCE / 2 / MAINTENANCE_WINDOW_FOLLOWUP

**Type:** EMAIL  
**Timing:** 7_BUSINESS_DAYS_AFTER_STEP_1_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

- Inspection timing

- Maintenance planning

**Copy Variants**

- Hi {{first_name}}, following up on the inspection/maintenance planning for {{verified_asset_label}}. I do not want to assume the original timing still applies. Is there a better timing window for your team, or should I close this out for now? - Rhonda

- Hi {{first_name}}, just checking the timing for {{verified_asset_label}}. I do not want to keep an outdated date on our side. If the current window no longer works, reply with the updated timing and I will keep our side aligned. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_asset_label

**Required Evidence Fields**

- asset_id

- service_window_or_due_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create HUMAN_SERVICE_REVIEW task on reply.

**Ai Skeleton**

One low-pressure follow-up. Do not add a new technical claim or imply overdue service.


### ICS_INSTALLED_BASE_INSPECTION_MAINTENANCE / 3 / MAINTENANCE_NO_RESPONSE_REVIEW

**Type:** TASK  
**Timing:** 10_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

- asset_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Create owner review: close, reschedule from verified new basis, or manually continue.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_INSTALLED_BASE_REPAIR_CONDITION / 1 / REPAIR_CONDITION_HUMAN_REVIEW

**Type:** TASK  
**Timing:** IMMEDIATE_ON_VERIFIED_TRIGGER  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- asset_id

- condition_or_request_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Create REPAIR_CONDITION_REVIEW task with evidence link and urgency flag.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_INSTALLED_BASE_REPAIR_CONDITION / 2 / REPAIR_SCOPE_CHECK

**Type:** EMAIL  
**Timing:** AFTER_STEP_1_HUMAN_APPROVAL  
**Approval:** REQUIRED

**Subject Variants**

- Repair scope review

- Cooling tower repair

**Copy Variants**

- Hi {{first_name}}, I am following up on {{approved_condition_or_request_summary}} for {{verified_asset_label}}. Would you like us to review the repair scope and the information needed for an RFQ? If your team is already handling this with someone at ICS, I will leave it with them. I will keep any follow-up tied to the condition information already approved in our record. - Rhonda

- Hi {{first_name}}, we have a verified repair item for {{verified_asset_label}} that is ready for follow-up. Should we coordinate the repair scope and RFQ details with your team? If there is already an active ICS conversation, I will not duplicate it. I can route any technical detail to the appropriate ICS person rather than make assumptions in email. - Rhonda

**Required Crm Placeholders**

- first_name

- approved_condition_or_request_summary

- verified_asset_label

**Required Evidence Fields**

- asset_id

- condition_or_request_evidence_id

- human_approval_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

- urgency/outage/technical question -> immediate human takeover

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create REPAIR_REQUEST task and opportunity candidate on positive reply.

**Ai Skeleton**

Use only a human-approved condition/request summary tied to evidence. Never diagnose, characterize severity, or promise an outcome.


### ICS_INSTALLED_BASE_REPAIR_CONDITION / 3 / REPAIR_NO_RESPONSE_OWNER_REVIEW

**Type:** TASK  
**Timing:** 5_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

- asset_id

- condition_or_request_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Owner decides close, phone/manual outreach, or later verified follow-up date.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_INSTALLED_BASE_UPGRADE_MODERNIZATION / 1 / UPGRADE_REVIEW_CHECK

**Type:** EMAIL  
**Timing:** ON_HUMAN_APPROVED_UPGRADE_CANDIDATE_OR_EXPLICIT_REQUEST  
**Approval:** REQUIRED

**Subject Variants**

- Upgrade scope review

- Tower upgrade planning

**Copy Variants**

- Hi {{first_name}}, I am checking whether your team wants to review {{approved_upgrade_objective}} for {{verified_asset_label}}. If it is still on the planning list, we can coordinate the technical information needed to define scope. If not, I can close the follow-up for now. I will keep the discussion limited to the objective and facts already approved in our record. - Rhonda

- Hi {{first_name}}, we have {{approved_upgrade_objective}} recorded as a possible review item for {{verified_asset_label}}. Would it be useful to work through the scope with your team? I will keep the discussion limited to the facts already verified. If it is not a current priority, I can leave it there without adding another follow-up. - Rhonda

**Required Crm Placeholders**

- first_name

- approved_upgrade_objective

- verified_asset_label

**Required Evidence Fields**

- asset_id

- upgrade_candidate_evidence_id

- human_approval_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create UPGRADE_ENGINEERING_REVIEW task on positive/technical reply.

**Ai Skeleton**

Render only the approved upgrade objective. Do not assert capacity, efficiency, savings, defect, suitability, or required upgrade unless separately evidenced.


### ICS_INSTALLED_BASE_UPGRADE_MODERNIZATION / 2 / UPGRADE_TIMING_FOLLOWUP

**Type:** EMAIL  
**Timing:** 10_BUSINESS_DAYS_AFTER_STEP_1_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

- Upgrade timing

- Upgrade review status

**Copy Variants**

- Hi {{first_name}}, just closing the loop on {{approved_upgrade_objective}} for {{verified_asset_label}}. I do not want to assume the project is still active. Should we keep this on the current planning list, or pause it until a later date? - Rhonda

- Hi {{first_name}}, checking the status of the upgrade review for {{verified_asset_label}}. I will not treat silence as a decision or a confirmed project. If timing has moved, reply with the new window and I will leave it there until then. - Rhonda

**Required Crm Placeholders**

- first_name

- approved_upgrade_objective

- verified_asset_label

**Required Evidence Fields**

- asset_id

- upgrade_candidate_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create UPGRADE_STATUS task on reply.

**Ai Skeleton**

No new technical claims. Ask only for status/timing.


### ICS_INSTALLED_BASE_UPGRADE_MODERNIZATION / 3 / UPGRADE_NO_RESPONSE_REVIEW

**Type:** TASK  
**Timing:** 10_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

- asset_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Owner review: close, reschedule on verified date, or create active opportunity only from new evidence.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_INSTALLED_BASE_REBUILD_REPLACEMENT / 1 / REBUILD_REPLACEMENT_REVIEW_CHECK

**Type:** EMAIL  
**Timing:** ON_HUMAN_APPROVED_LIFECYCLE_CANDIDATE_OR_EXPLICIT_REQUEST  
**Approval:** REQUIRED

**Subject Variants**

- Rebuild replacement review

- Tower lifecycle review

**Copy Variants**

- Hi {{first_name}}, I am following up on the rebuild/replacement review for {{verified_asset_label}}. Is your team ready to compare the current scope and project timing? We can coordinate the technical information needed without assuming a final path before the review is complete. The review can stay open until your team decides which path, if any, makes sense. - Rhonda

- Hi {{first_name}}, we have an approved lifecycle review item for {{verified_asset_label}}. Would it be useful to compare repair, rebuild, and replacement scope with your team before the next decision point? I will keep the note at the planning level and avoid assuming a final technical recommendation until your team reviews it. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_asset_label

**Required Evidence Fields**

- asset_id

- lifecycle_candidate_evidence_id

- human_approval_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create REBUILD_REPLACEMENT_REVIEW task on positive reply.

**Ai Skeleton**

Use only a human-approved lifecycle candidate or explicit request. Do not call the asset end-of-life or replacement-required unless approved evidence explicitly supports that wording.


### ICS_INSTALLED_BASE_REBUILD_REPLACEMENT / 2 / REBUILD_REPLACEMENT_TIMING_FOLLOWUP

**Type:** EMAIL  
**Timing:** 10_BUSINESS_DAYS_AFTER_STEP_1_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

- Lifecycle review timing

- Rebuild review status

**Copy Variants**

- Hi {{first_name}}, just checking the timing on the lifecycle review for {{verified_asset_label}}. Is this still active, delayed, or something your team wants to revisit later? A short status reply is enough. - Rhonda

- Hi {{first_name}}, I do not want to keep sending generic follow-ups on {{verified_asset_label}}. If the rebuild/replacement review has moved, reply with the current timing and I will keep our side aligned. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_asset_label

**Required Evidence Fields**

- asset_id

- lifecycle_candidate_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create LIFECYCLE_STATUS_REVIEW task.

**Ai Skeleton**

Status/timing only; no technical recommendation added.


### ICS_INSTALLED_BASE_REBUILD_REPLACEMENT / 3 / REBUILD_REPLACEMENT_NO_RESPONSE_REVIEW

**Type:** TASK  
**Timing:** 10_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

- asset_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Owner review: close, delay, or convert only from evidence-backed response/status.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_PARTS_TECHNICAL_FIT_SUPPORT / 1 / PARTS_TECHNICAL_TRIAGE

**Type:** TASK  
**Timing:** IMMEDIATE_ON_VERIFIED_PARTS_REQUEST  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- parts_request_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Create PARTS_TECHNICAL_TRIAGE task; identify exact missing identification fields from approved parts field registry.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_PARTS_TECHNICAL_FIT_SUPPORT / 2 / PARTS_IDENTIFICATION_REQUEST

**Type:** EMAIL  
**Timing:** AFTER_TRIAGE_IF_INFORMATION_IS_MISSING_AND_HUMAN_APPROVED  
**Approval:** REQUIRED

**Subject Variants**

- Part identification details

- Parts request details

**Copy Variants**

- Hi {{first_name}}, I can help route the parts request for {{verified_part_request_label}}. Before we confirm fit, could you send {{approved_missing_part_identification_request}}? We will not assume compatibility from the request alone. If you have a photo, drawing, nameplate detail, or current part reference, send only what is available; the parts team can confirm what else is needed. - Rhonda

- Hi {{first_name}}, we have the parts request for {{verified_part_request_label}}. To make sure the right person reviews it, could you send {{approved_missing_part_identification_request}}? We will confirm fit before any final part recommendation. Any photo, drawing, nameplate detail, or current part reference you already have can help the technical review, but we will not invent missing identifiers. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_part_request_label

- approved_missing_part_identification_request

**Required Evidence Fields**

- parts_request_evidence_id

- missing_parts_fields

- human_approval_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create PARTS_TECHNICAL_CONFIRMATION task on reply.

**Ai Skeleton**

Ask only for missing identification details selected from an approved field registry. Never invent compatibility, OEM status, stock, price, lead time, MPN or GTIN.


### ICS_PARTS_TECHNICAL_FIT_SUPPORT / 3 / PARTS_NO_RESPONSE_REVIEW

**Type:** TASK  
**Timing:** 3_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

- parts_request_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Owner/parts team decides manual follow-up or close pending customer details.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_PARTS_RELATIONSHIP_REENGAGEMENT / 1 / PARTS_RELATIONSHIP_CHECKIN

**Type:** EMAIL  
**Timing:** AT_VERIFIED_REENGAGE_AT_OR_REPEAT_TIMING  
**Approval:** REQUIRED

**Subject Variants**

- Parts support check

- Cooling tower parts

**Copy Variants**

- Hi {{first_name}}, I am checking in on parts support for {{verified_account_or_site_label}}. Are there any replacement components your team wants us to review for an upcoming maintenance or outage window? If you send the tower or part details, we can confirm the right next step. We will confirm technical fit before anything is quoted or recommended. - Rhonda

- Hi {{first_name}}, I wanted to check whether {{verified_account_or_site_label}} has any cooling-tower parts needs we should review. If something is active, send the part or tower details and we will route it for technical confirmation before quoting. We will not assume compatibility or availability from an old order or part description. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_account_or_site_label

**Required Evidence Fields**

- parts_relationship_evidence_id

- reengage_basis_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create PARTS_REQUEST task on positive reply.

**Ai Skeleton**

Relationship reengagement only. Do not state that a part is due, in stock, compatible, OEM, or available at a specific price/lead time.


### ICS_PARTS_RELATIONSHIP_REENGAGEMENT / 2 / PARTS_RELATIONSHIP_CLOSE_LOOP

**Type:** EMAIL  
**Timing:** 14_BUSINESS_DAYS_AFTER_STEP_1_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

- Parts support followup

- Parts planning

**Copy Variants**

- Hi {{first_name}}, just closing the loop on parts support for {{verified_account_or_site_label}}. If there is nothing active now, I will leave it here. If something comes up later, reply with the tower or part details and we can review fit then. - Rhonda

- Hi {{first_name}}, one last check on parts support for {{verified_account_or_site_label}}. I do not want to keep contacting you when there is no active need. If timing has moved, no problem - I will close this follow-up for now. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_account_or_site_label

**Required Evidence Fields**

- parts_relationship_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create PARTS_REENGAGEMENT_STATUS task on reply.

**Ai Skeleton**

Close-loop follow-up only; do not introduce new product or technical claims.


### ICS_PARTS_RELATIONSHIP_REENGAGEMENT / 3 / PARTS_REENGAGEMENT_EXIT

**Type:** TASK  
**Timing:** 7_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Mark enrollment completed/no-response; preserve relationship evidence and future owner-approved timing only.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.


### ICS_SERVICE_RELATIONSHIP_REENGAGEMENT / 1 / SERVICE_RELATIONSHIP_CHECKIN

**Type:** EMAIL  
**Timing:** AT_VERIFIED_REENGAGE_AT_OR_HISTORICAL_TIMING  
**Approval:** REQUIRED

**Subject Variants**

- Service planning check

- Cooling tower service

**Copy Variants**

- Hi {{first_name}}, I am checking in on cooling-tower service for {{verified_account_or_site_label}}. Does your team have any inspection, repair, or maintenance work planned that you want ICS to review? If not, no problem - I can close this out for now. I do not want to assume any service is due; this is only a planning check based on the verified relationship history we have. - Rhonda

- Hi {{first_name}}, I wanted to check whether there is any cooling-tower service work at {{verified_account_or_site_label}} that your team wants us to review. If there is an active need, reply with the site or tower details and we will route it to the right person. We will not assume a service interval, condition, or outage schedule from prior records. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_account_or_site_label

**Required Evidence Fields**

- service_relationship_evidence_id

- reengage_basis_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create SERVICE_REQUEST task on positive reply.

**Ai Skeleton**

Do not claim service is due/overdue or that ICS knows a defect/outage. The relationship is verified; current need remains a question unless separately evidenced.


### ICS_SERVICE_RELATIONSHIP_REENGAGEMENT / 2 / SERVICE_RELATIONSHIP_CLOSE_LOOP

**Type:** EMAIL  
**Timing:** 14_BUSINESS_DAYS_AFTER_STEP_1_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

- Service timing

- Service planning followup

**Copy Variants**

- Hi {{first_name}}, just closing the loop on service planning for {{verified_account_or_site_label}}. If the timing has moved, reply with the new window and I will keep our side aligned. Otherwise I will leave it here for now. - Rhonda

- Hi {{first_name}}, one last check on service planning for {{verified_account_or_site_label}}. I do not want to create a service schedule from silence or old history. If there is nothing active now, I will close the follow-up. - Rhonda

**Required Crm Placeholders**

- first_name

- verified_account_or_site_label

**Required Evidence Fields**

- service_relationship_evidence_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

Any substantive reply activates the accepted conversation lock and routes through E1.2 reply/handoff policy.

**Task Creation**

Create SERVICE_REENGAGEMENT_STATUS task on reply.

**Ai Skeleton**

Close-loop follow-up only. Never convert non-response into a maintenance-due fact.


### ICS_SERVICE_RELATIONSHIP_REENGAGEMENT / 3 / SERVICE_REENGAGEMENT_EXIT

**Type:** TASK  
**Timing:** 7_BUSINESS_DAYS_AFTER_STEP_2_NO_REPLY  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

**Required Evidence Fields**

- account_id

- contact_id

**Stop Conditions**

- tenant/contact suppression blocks the message purpose

- hard bounce/invalid address

- jurisdiction/eligibility policy becomes blocked or unresolved for the intended message

- tenant/domain/mailbox/sequence kill switch

- relationship evidence is revoked/downgraded below sequence minimum

- account/site/asset link materially changes and current scope can no longer be proven

**Pause Conditions**

- human reply received

- active salesperson conversation/contact lock

- account owner lock when configured

- RFQ sequence becomes active

- quote/proposal sequence becomes active

- new opportunity requiring human handling

- sending identity policy blocks the traffic class

**Reply Handling**

N/A - internal task.

**Task Creation**

Mark completed/no-response; future contact requires new verified timing/owner approval and collision review.

**Ai Skeleton**

No customer message. Create/route the defined human task using only verified CRM evidence.

## ICS_EMAIL_REVENUE_E1_3_LEGACY_REINTRODUCTION_PILOT_COHORT_PLAN_2026-09-13_R1

| Sequence | Step count |
|---|---:|
| `ICS_LEGACY_REINTRODUCTION_PILOT` | 3 |

### ICS_LEGACY_REINTRODUCTION_PILOT / 1 / LEGACY_REINTRO_INITIAL

**Type:** EMAIL  
**Timing:** 0 days after authorized enrollment; future activation only  
**Approval:** REQUIRED

**Subject Variants**

- Cooling tower support

- Industrial cooling support

**Copy Variants**

- Hi {{safe_salutation}} — Rhonda with Industrial Cooling Solutions. I’m reaching out because we work with large industrial cooling towers across service, repairs, upgrades, and parts. If there’s anything active or planned that would be useful for us to review, reply here with whatever you have and I’ll route it to the right person.

**Required Crm Placeholders**

- safe_salutation

**Stop Conditions**

- reply

- suppression

- complaint

- hard bounce

- active human conversation

- E1.1 RFQ active

- E1.1 quote active

- E1.2 active motion

- eligibility downgrade

- jurisdiction uncertainty

- kill switch

- sending identity not healthy

**Pause Conditions**

- human/account-owner lock

- data reconciliation conflict

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any human reply pauses generic E1.3.

**Task Creation**

Owner task on positive/qualified reply or ambiguous human reply.

**Ai Skeleton**

Use approved exact copy as base. Constrained rewrite may use safe_salutation only by default; no employer/relationship/project/asset claim unless separately evidence-gated and human-approved.


### ICS_LEGACY_REINTRODUCTION_PILOT / 2 / LEGACY_REINTRO_FOLLOWUP

**Type:** EMAIL  
**Timing:** PROPOSED 7 business days after Step 1; activation owner input may adjust before publication  
**Approval:** REQUIRED

**Subject Variants**

- Cooling tower support

**Copy Variants**

- Hi {{safe_salutation}} — just following up on my note. If there’s a cooling-tower service, repair, upgrade, parts, or larger project question on your side, reply with whatever you have and we can route it appropriately. If there isn’t anything current, no problem.

**Required Crm Placeholders**

- safe_salutation

**Stop Conditions**

- any reply

- suppression

- complaint

- hard bounce

- active human conversation

- E1.1 RFQ active

- E1.1 quote active

- E1.2 active motion

- eligibility/evidence downgrade

- jurisdiction uncertainty

- kill switch

- sending identity not healthy

**Pause Conditions**

- human/account-owner lock

- data quality conflict

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any human reply pauses generic E1.3.

**Task Creation**

Owner task on response requiring action.

**Ai Skeleton**

Use approved follow-up skeleton. Do not claim prior interaction, project, employer, asset, urgency, or customer status.


### ICS_LEGACY_REINTRODUCTION_PILOT / 3 / LEGACY_REINTRO_HUMAN_REVIEW_CLOSE

**Type:** TASK  
**Timing:** PROPOSED 7 business days after Step 2 if no reply; no further automated email  
**Approval:** REQUIRED

**Subject Variants**

**Copy Variants**

**Required Crm Placeholders**

- canonical_contact_id

**Stop Conditions**

- sequence closed

- human takes over

- suppression

- higher-priority commercial workflow

**Pause Conditions**

**Reply Handling**

N/A; prior reply would already have paused sequence.

**Task Creation**

Review outcome: close dormant, enrich/reconcile, or route to E1.1/E1.2/human sales when better evidence exists.

**Ai Skeleton**

## ICS_EMAIL_REVENUE_E1_4_MEGA_PROJECT_BUYING_GROUP_NURTURE_2026-09-13_R1

| Sequence | Step count |
|---|---:|
| `ICS_E1_4_PROJECT_DISCOVERY` | 4 |
| `ICS_E1_4_TECHNICAL_SCOPING_COORDINATION` | 4 |
| `ICS_E1_4_PROCUREMENT_READINESS` | 4 |
| `ICS_E1_4_DELAYED_ON_HOLD_REENGAGEMENT` | 3 |

### ICS_E1_4_PROJECT_DISCOVERY / 1 / PROJECT_EVIDENCE_REVIEW

**Type:** TASK  
**Timing:** At enrollment before any customer-facing draft  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Confirm project signal, canonical project/opportunity identity, project type, current stage, buying-group membership, and safe evidence scope.

**Ai Skeleton**


### ICS_E1_4_PROJECT_DISCOVERY / 2 / PROJECT_DISCOVERY_CONTACT

**Type:** EMAIL  
**Timing:** 0 days after human approval of project evidence and recipient membership  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "GENERIC",
  "subject_variants": [
    "Cooling tower project",
    "Project scope review"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m reaching out about the verified cooling-tower project associated with {{verified_account_name}}. If your team is still defining the scope, we can work from the information already confirmed and leave open items as open. What would be most useful for ICS to help clarify at this stage?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_UNKNOWN_OR_GENERIC_SAFE"
}
```

```json
{
  "role_class": "ENGINEERING_TECHNICAL",
  "subject_variants": [
    "Technical scope support",
    "Cooling tower scope"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m reaching out about the verified cooling-tower project associated with {{verified_account_name}}. If the technical scope is still being defined, we can help organize the confirmed design inputs and identify what remains open without assuming missing requirements. What technical question would be most useful for ICS to review first?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_ENGINEERING_TECHNICAL"
}
```

```json
{
  "role_class": "PROJECT_MANAGEMENT",
  "subject_variants": [
    "Project coordination",
    "Cooling tower project"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m reaching out about the verified cooling-tower project associated with {{verified_account_name}}. We can help keep the current scope, open technical items, and next information needs organized without assuming dates or requirements that have not been confirmed. What would be most useful for ICS to help coordinate next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROJECT_MANAGEMENT"
}
```

**Required Crm Placeholders**

- first_name

- verified_account_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create project-owner task on reply, missing-scope request, or evidence conflict.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_PROJECT_DISCOVERY / 3 / PROJECT_DISCOVERY_FOLLOWUP

**Type:** EMAIL  
**Timing:** PROPOSED 5 business days after prior approved email if no reply and project evidence remains current  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "GENERIC",
  "subject_variants": [
    "Project scope follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the cooling-tower project note. If the project is still active, we can work from the information your team has already confirmed and leave unresolved items open rather than guessing. Is there a specific project question you want ICS to review next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED"
}
```

```json
{
  "role_class": "ENGINEERING_TECHNICAL",
  "subject_variants": [
    "Technical scope follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the technical-scope note. If the project is still active, we can review the design inputs your team has confirmed and keep missing requirements explicitly open. Is there one technical item you would like ICS to look at next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_ENGINEERING_TECHNICAL"
}
```

**Required Crm Placeholders**

- first_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create human review task on response or ambiguity.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_PROJECT_DISCOVERY / 4 / DISCOVERY_HUMAN_REVIEW

**Type:** TASK  
**Timing:** PROPOSED 5 business days after follow-up if no reply; no further autonomous discovery email  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Review whether to promote to technical scoping, pause, close nurture, or schedule an evidenced next review.

**Ai Skeleton**


### ICS_E1_4_TECHNICAL_SCOPING_COORDINATION / 1 / TECH_SCOPE_OWNER_REVIEW

**Type:** TASK  
**Timing:** At stage entry before customer-facing draft  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Verify technical-scoping stage, same-project evidence, recipient project membership, role evidence, and allowed project facts.

**Ai Skeleton**


### ICS_E1_4_TECHNICAL_SCOPING_COORDINATION / 2 / TECHNICAL_SCOPE_COORDINATION

**Type:** EMAIL  
**Timing:** 0 days after REQUIRED approval  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "ENGINEERING_TECHNICAL",
  "subject_variants": [
    "Technical scope review",
    "Project design inputs"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking in on the verified cooling-tower project for {{verified_account_name}}. We can review the technical inputs your team has already confirmed and identify any information still needed for ICS to assess the scope without filling gaps by assumption. Which technical item should we focus on first?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_ENGINEERING_TECHNICAL"
}
```

```json
{
  "role_class": "PLANT_OPERATIONS",
  "subject_variants": [
    "Project operating needs",
    "Cooling tower project"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking in on the verified cooling-tower project for {{verified_account_name}}. We can work from the operational constraints your team has actually confirmed and keep any outage, installation, or performance details open until they are verified. What project requirement would be most useful for ICS to review first?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PLANT_OPERATIONS"
}
```

```json
{
  "role_class": "EPC_CONSULTANT_THIRD_PARTY_ENGINEER",
  "subject_variants": [
    "Project coordination",
    "Technical project interface"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m reaching out regarding the verified cooling-tower project that your team is documented as supporting. We can coordinate on the project information that is approved for sharing and keep owner-specific or unverified details out of the discussion. What technical interface item would be most useful to address first?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_EPC; THIRD_PARTY_DISCLOSURE_SCOPE_PASS"
}
```

```json
{
  "role_class": "UNKNOWN",
  "subject_variants": [
    "Project scope review"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m following the verified cooling-tower project associated with {{verified_account_name}}. We can work from the project information that has been confirmed and avoid assumptions about responsibilities, timing, or technical requirements that remain open. What would be most useful for ICS to help clarify at this stage?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_UNKNOWN_GENERIC_ONLY"
}
```

**Required Crm Placeholders**

- first_name

- verified_account_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create technical/project-owner task on reply or request.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_TECHNICAL_SCOPING_COORDINATION / 3 / STAKEHOLDER_COORDINATION_FOLLOWUP

**Type:** EMAIL  
**Timing:** PROPOSED 5 business days after approved stage-entry email if no reply  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "GENERIC",
  "subject_variants": [
    "Project coordination follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the cooling-tower project. We can keep the next discussion focused on the confirmed project scope and route open technical or coordination questions to the right ICS person. Is there one item your team wants to resolve before the project moves to its next verified stage?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED"
}
```

```json
{
  "role_class": "PROJECT_MANAGEMENT",
  "subject_variants": [
    "Project coordination follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the project-coordination note. We can help organize the confirmed scope, open questions, and information needed from ICS without assuming a schedule or decision process that has not been established. Is there one coordination item you want us to address next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROJECT_MANAGEMENT"
}
```

**Required Crm Placeholders**

- first_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create human task on response, role conflict, or scope change.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_TECHNICAL_SCOPING_COORDINATION / 4 / TECH_SCOPE_HUMAN_REVIEW

**Type:** TASK  
**Timing:** PROPOSED 5 business days after follow-up if no reply  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Review promotion to procurement readiness, continue human technical exchange, pause, or set evidenced next review.

**Ai Skeleton**


### ICS_E1_4_PROCUREMENT_READINESS / 1 / PROCUREMENT_STAGE_REVIEW

**Type:** TASK  
**Timing:** At stage entry before customer-facing draft  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Verify budgeting/procurement-preparation stage, project membership, role evidence, and that no RFQ/quote flow already exists.

**Ai Skeleton**


### ICS_E1_4_PROCUREMENT_READINESS / 2 / PROCUREMENT_READINESS_CONTACT

**Type:** EMAIL  
**Timing:** 0 days after REQUIRED approval  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "PROCUREMENT_SOURCING",
  "subject_variants": [
    "Procurement readiness",
    "Project commercial process"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking in on the verified cooling-tower project for {{verified_account_name}}. We can provide the project information your team needs for vendor review, specification alignment, or quote readiness without assuming a procurement route or commercial requirement that has not been confirmed. What would be most useful from ICS at this stage?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROCUREMENT_SOURCING"
}
```

```json
{
  "role_class": "PROJECT_MANAGEMENT",
  "subject_variants": [
    "Project readiness",
    "Cooling tower project"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking in on the verified cooling-tower project for {{verified_account_name}}. We can help organize the confirmed technical and commercial information needed for the next project step while leaving any unverified timing, budget, or procurement details open. What would be most useful for ICS to prepare next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROJECT_MANAGEMENT"
}
```

```json
{
  "role_class": "EXECUTIVE_ECONOMIC_SPONSOR",
  "subject_variants": [
    "Project status",
    "Cooling tower project"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m reaching out about the verified cooling-tower project associated with {{verified_account_name}}. We can keep the discussion focused on the confirmed project objective, current status, and information needed from ICS without assuming budget, ROI, or decision timing. What would be most useful to clarify for the next project step?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_EXECUTIVE_ECONOMIC_SPONSOR"
}
```

```json
{
  "role_class": "UNKNOWN",
  "subject_variants": [
    "Project readiness"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking in on the verified cooling-tower project associated with {{verified_account_name}}. We can work from the project information that is already confirmed and avoid assumptions about responsibilities, budget, timing, or procurement. What information would be most useful for ICS to prepare or clarify at this stage?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_UNKNOWN_GENERIC_ONLY"
}
```

**Required Crm Placeholders**

- first_name

- verified_account_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create project-owner/commercial task on reply, quote request, or procurement requirement.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_PROCUREMENT_READINESS / 3 / PROCUREMENT_READINESS_FOLLOWUP

**Type:** EMAIL  
**Timing:** PROPOSED 7 business days after approved email if no reply and no RFQ/quote transition  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "GENERIC",
  "subject_variants": [
    "Project readiness follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the cooling-tower project. If the project is still in preparation, we can provide the confirmed technical or company information your team needs and leave unresolved commercial details open. Is there one item you want ICS to prepare before the next verified project step?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED"
}
```

```json
{
  "role_class": "PROCUREMENT_SOURCING",
  "subject_variants": [
    "Procurement follow-up"
  ],
  "copy_variants": [
    "Hi {{first_name}} — following up on the project-readiness note. If your team is still organizing the procurement or vendor-review process, we can provide the information that is actually requested without assuming the route or timing. Is there one item you need from ICS next?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROCUREMENT_SOURCING"
}
```

**Required Crm Placeholders**

- first_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

If reply requests RFQ/quote, route to E1.1 and lock E1.4; otherwise create owner task.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_PROCUREMENT_READINESS / 4 / PROCUREMENT_HUMAN_REVIEW_ROUTE

**Type:** TASK  
**Timing:** PROPOSED 7 business days after follow-up if no reply  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Review for RFQ transition, quote readiness, human outreach, delay/on-hold, or close. No further autonomous procurement email.

**Ai Skeleton**


### ICS_E1_4_DELAYED_ON_HOLD_REENGAGEMENT / 1 / DELAYED_PROJECT_REVIEW

**Type:** TASK  
**Timing:** Only when explicit next_review_at/owner-reviewed follow-up point is reached  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Verify project remains real, on-hold/delayed state is current, recipient membership remains valid, and no E1.1/human collision exists.

**Ai Skeleton**


### ICS_E1_4_DELAYED_ON_HOLD_REENGAGEMENT / 2 / DELAYED_PROJECT_REENGAGEMENT

**Type:** EMAIL  
**Timing:** At verified review point after REQUIRED approval; never from elapsed time alone  
**Approval:** REQUIRED

**Role Copy Variants**

```json
{
  "role_class": "GENERIC",
  "subject_variants": [
    "Project status check",
    "Cooling tower project"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking back on the verified cooling-tower project associated with {{verified_account_name}} because the project record has reached its approved review point. We have not assumed that the project is active, cancelled, or on a particular schedule. Is there a current status your team would like us to work from?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; VERIFIED_REVIEW_POINT"
}
```

```json
{
  "role_class": "PROJECT_MANAGEMENT",
  "subject_variants": [
    "Project status check"
  ],
  "copy_variants": [
    "Hi {{first_name}} — Rhonda with Industrial Cooling Solutions. I’m checking back on the verified cooling-tower project associated with {{verified_account_name}} at the approved review point in our project record. We have not assumed a new schedule or decision. Is there a current project status or next information need you want ICS to use?"
  ],
  "required_role_evidence": "PROJECT_MEMBER_VERIFIED; ROLE_VERIFIED_PROJECT_MANAGEMENT; VERIFIED_REVIEW_POINT"
}
```

**Required Crm Placeholders**

- first_name

- verified_account_name

- canonical_project_identity

**Stop Conditions**

- any reply

- active human conversation

- E1.1 RFQ active

- E1.1 quote/proposal active

- suppression/complaint/hard bounce

- jurisdiction unresolved

- project evidence downgrade

- project closed/cancelled/won/lost

- project identity changed

- kill switch

- sending identity unhealthy

**Pause Conditions**

- human/account/project-owner lock

- scope mismatch

- membership/role evidence conflict

- account/project frequency collision

- deliverability readiness not proven

**Reply Handling**

Use frozen E1.1 reply-action matrix; any genuine reply activates conversation lock and pauses unattended E1.4.

**Task Creation**

Create human task for any updated status; route RFQ/quote to E1.1.

**Ai Skeleton**

Use the approved role-safe skeleton. AI may synthesize only from verified same-project evidence. UNKNOWN stays UNKNOWN. One question maximum. No budget/timing/technical claims without evidence.


### ICS_E1_4_DELAYED_ON_HOLD_REENGAGEMENT / 3 / DELAYED_PROJECT_CLOSE_OR_NEXT_REVIEW

**Type:** TASK  
**Timing:** PROPOSED 7 business days after reengagement if no reply; no second autonomous reengagement email  
**Approval:** REQUIRED

**Role Copy Variants**

**Required Crm Placeholders**

- account_id

- opportunity_id

- canonical_project_identity

**Stop Conditions**

- task completed

- project terminal

- higher-priority E1.1 flow

- suppression block

**Pause Conditions**

**Reply Handling**

N/A

**Task Creation**

Human review: keep on hold with new evidenced review point, close/cancel, promote to active stage, or stop nurture.

**Ai Skeleton**

