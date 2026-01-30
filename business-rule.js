// Email Script: u_ritm_closed_complete_access_email
// NOTE: In Notifications, you cannot do email.setTo()/setCc().
// Use an event-driven notification where:
//   event.parm1 = TO list (comma/semicolon separated emails)
//   event.parm2 = CC list (comma/semicolon separated emails)

var CONFIG_TABLE = "u_software_access_fulfillment";

// ---------------- Helpers ----------------
function trimStr(s) {
	return (s === null || s === undefined) ? "" : ("" + s).replace(/^\s+|\s+$/g, "");
}

function splitEmails(listStr) {
	if (listStr === null || listStr === undefined) return [];
	var s = ("" + listStr);
	if (!s) return [];
	var parts = s.split(/[;,]/);
	var out = [];
	for (var i = 0; i < parts.length; i++) {
		var p = trimStr(parts[i]);
		if (p) out.push(p);
	}
	return out;
}

function asHtmlPreserveNewlines(s) {
	if (s === null || s === undefined) return "";
	s = "" + s;

	// If it looks like HTML, don't escape it; otherwise escape.
	var looksLikeHtml = /<[^>]+>/.test(s);
	if (!looksLikeHtml) s = gs.xmlEncode(s);

	return s.replace(/\r\n|\r|\n/g, "<br/>");
}

function getLastApprovedByName(ritmSysId) {
	var appr = new GlideRecord("sysapproval_approver");
	appr.addQuery("sysapproval", ritmSysId);
	appr.addQuery("state", "approved");
	appr.orderByDesc("sys_updated_on");
	appr.setLimit(1);
	appr.query();
	if (appr.next()) return appr.approver.getDisplayValue();
	return "";
}

function printVariablesTable(ritm) {
	var printed = 0;

	// Preferred approach: variable pool
	try {
		var qset = new GlideappVariablePoolQuestionSet();
		qset.setRequestID(ritm.sys_id.toString());
		qset.load();

		var questions = qset.getFlatQuestions();
		var count = (questions && questions.size) ? questions.size() : 0;

		for (var i = 0; i < count; i++) {
			var q = questions.get(i);
			if (!q) continue;

			var label = "";
			var val = "";
			try { label = q.getLabel(); } catch (e1) {}
			try { val = q.getDisplayValue(); } catch (e2) {}

			label = (label === null || label === undefined) ? "" : ("" + label);
			val   = (val === null || val === undefined) ? "" : ("" + val);

			if (gs.nil(label) && gs.nil(val)) continue;

			template.print(
				"<tr>" +
					"<td><b>" + gs.xmlEncode(label) + "</b></td>" +
					"<td>" + gs.xmlEncode(val) + "</td>" +
				"</tr>"
			);
			printed++;
		}

		return printed;
	} catch (e) {
		// fall through to mtom fallback
	}

	// Fallback: sc_item_option_mtom
	var mtom = new GlideRecord("sc_item_option_mtom");
	mtom.addQuery("request_item", ritm.sys_id);
	mtom.query();

	while (mtom.next()) {
		var opt = mtom.sc_item_option.getRefRecord();
		if (!opt || !opt.isValidRecord()) continue;

		var qLabel = opt.getDisplayValue("item_option_new");
		var qVal = opt.getDisplayValue("value");
		if (gs.nil(qVal)) qVal = opt.getValue("value");

		qLabel = (qLabel === null || qLabel === undefined) ? "" : ("" + qLabel);
		qVal   = (qVal === null || qVal === undefined) ? "" : ("" + qVal);

		if (gs.nil(qLabel) && gs.nil(qVal)) continue;

		template.print(
			"<tr>" +
				"<td><b>" + gs.xmlEncode(qLabel) + "</b></td>" +
				"<td>" + gs.xmlEncode(qVal) + "</td>" +
			"</tr>"
		);
		printed++;
	}

	return printed;
}

// ---------------- Main ----------------
try {
	// Catalog item name
	var itemName = "";
	try { itemName = current.cat_item.getDisplayValue(); } catch (e0) {}
	itemName = itemName || "";

	// Subject (required)
	email.setSubject("Access request for " + itemName);

	// ---- Add recipients from event parms ----
	// parm1 = TO list, parm2 = CC list (set by your BR that queues the event)
	if (event && event.parm2) {
		var ccList = splitEmails(event.parm2);
		for (var c = 0; c < ccList.length; c++) {
			email.addAddress("cc", ccList[c]);
		}
	}
	// NOTE: TO is handled by the Notification "Who will receive" using Event parm 1.
	// Do NOT attempt to set TO here.

	// ---- Lookup config row ----
	var cfg = new GlideRecord(CONFIG_TABLE);
	cfg.addQuery("u_service_item", itemName);
	cfg.setLimit(1);
	cfg.query();
	var hasCfg = cfg.next();

	// ---- Email content ----
	var emailContent = "";
	if (hasCfg) {
		emailContent = cfg.getValue("u_email_content");
		if (gs.nil(emailContent)) emailContent = cfg.getDisplayValue("u_email_content");
	}

	if (gs.nil(emailContent)) {
		emailContent = "Hello,\n\nYour access request has been completed.";
	}

	// Print content
	template.print(asHtmlPreserveNewlines(emailContent));
	template.print("<br/><br/>");

	// Last approver (optional)
	var lastApprover = getLastApprovedByName(current.sys_id.toString());
	if (!gs.nil(lastApprover)) {
		template.print("<b>Last approved by:</b> " + gs.xmlEncode(lastApprover) + "<br/><br/>");
	}

	// Context (optional but helpful)
	template.print("<b>RITM:</b> " + gs.xmlEncode((current.number || "").toString()) + "<br/>");
	template.print("<b>Catalog Item:</b> " + gs.xmlEncode(itemName) + "<br/>");
	try {
		template.print("<b>Requested For:</b> " + gs.xmlEncode(current.requested_for.getDisplayValue()) + "<br/>");
	} catch (eRF) {}
	template.print("<br/>");

	// Variables
	template.print("<b>Details:</b><br/>");
	template.print("<table style='border-collapse:collapse;' border='1' cellpadding='4'>");
	var count = printVariablesTable(current);
	template.print("</table>");

	if (count === 0) {
		template.print("<br/>No variables found.");
	}

} catch (ex) {
	gs.error("Mail Script u_ritm_closed_complete_access_email failed for RITM " + current.number + ": " + ex);
	template.print("Error generating email content for " + gs.xmlEncode((current.number || "").toString()) + ". Check system logs.");
}

