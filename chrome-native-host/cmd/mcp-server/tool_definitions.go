package main

type toolDefinition struct {
	name        string
	description string
	inputSchema map[string]any
}

type schemaOption func(map[string]any)

func objectSchema(properties map[string]any, required ...string) map[string]any {
	req := append([]string{}, required...)
	return map[string]any{
		"type":       "object",
		"properties": properties,
		"required":   req,
	}
}

func stringSchema(description string, options ...schemaOption) map[string]any {
	return scalarSchema("string", description, options...)
}

func numberSchema(description string, options ...schemaOption) map[string]any {
	return scalarSchema("number", description, options...)
}

func booleanSchema(description string, options ...schemaOption) map[string]any {
	return scalarSchema("boolean", description, options...)
}

func scalarSchema(schemaType string, description string, options ...schemaOption) map[string]any {
	schema := map[string]any{
		"type": schemaType,
	}
	if description != "" {
		schema["description"] = description
	}
	for _, option := range options {
		option(schema)
	}
	return schema
}

func arraySchema(description string, items any, options ...schemaOption) map[string]any {
	schema := map[string]any{
		"type":  "array",
		"items": items,
	}
	if description != "" {
		schema["description"] = description
	}
	for _, option := range options {
		option(schema)
	}
	return schema
}

func objectProperty(description string, properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{
		"type":       "object",
		"properties": properties,
	}
	if description != "" {
		schema["description"] = description
	}
	if required != nil {
		schema["required"] = required
	}
	return schema
}

func withEnum(values ...string) schemaOption {
	return func(schema map[string]any) {
		schema["enum"] = values
	}
}

func withMinimum(value int) schemaOption {
	return func(schema map[string]any) {
		schema["minimum"] = value
	}
}

func withMaximum(value int) schemaOption {
	return func(schema map[string]any) {
		schema["maximum"] = value
	}
}

func withMinItems(value int) schemaOption {
	return func(schema map[string]any) {
		schema["minItems"] = value
	}
}

func withMaxItems(value int) schemaOption {
	return func(schema map[string]any) {
		schema["maxItems"] = value
	}
}

var toolDefinitions = []toolDefinition{
	{
		name:        "javascript_tool",
		description: "Execute JavaScript code in the context of the current page. The code runs in the page's context and can interact with the DOM, window object, and page variables. Returns the result of the last expression or any thrown errors. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"action": stringSchema("Must be set to 'javascript_exec'."),
			"text":   stringSchema("The JavaScript code to execute. The code runs in the page context. Do not use return statements; just write the expression you want to evaluate."),
			"tabId":  numberSchema("Tab ID to execute the code in. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "action", "text", "tabId"),
	},
	{
		name:        "navigate",
		description: "Navigate to a URL, or go forward/back in browser history. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"url":   stringSchema("The URL to navigate to. Can be provided with or without protocol (defaults to https://). Use 'forward' to go forward in history or 'back' to go back in history."),
			"tabId": numberSchema("Tab ID to navigate. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "url", "tabId"),
	},
	{
		name:        "computer",
		description: "Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.\n* Whenever you intend to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.\n* If you tried clicking on a program or link but it failed to load, even after waiting, try adjusting your click location so that the tip of the cursor visually falls on the element that you want to click.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
		inputSchema: objectSchema(map[string]any{
			"action": stringSchema(
				"The action to perform.",
				withEnum(
					"left_click",
					"right_click",
					"type",
					"screenshot",
					"wait",
					"scroll",
					"key",
					"left_click_drag",
					"double_click",
					"triple_click",
					"zoom",
					"scroll_to",
					"hover",
				),
			),
			"coordinate": arraySchema(
				"(x, y): The x and y coordinates. Required for left_click, right_click, double_click, triple_click, and scroll. For left_click_drag, this is the end position.",
				map[string]any{"type": "number"},
				withMinItems(2),
				withMaxItems(2),
			),
			"text":             stringSchema("The text to type (for type) or the key(s) to press (for key). For key, provide space-separated keys or shortcuts such as cmd+a or ctrl+a."),
			"duration":         numberSchema("The number of seconds to wait. Required for wait. Maximum 30 seconds.", withMinimum(0), withMaximum(30)),
			"scroll_direction": stringSchema("The direction to scroll. Required for scroll.", withEnum("up", "down", "left", "right")),
			"scroll_amount":    numberSchema("The number of scroll wheel ticks. Optional for scroll, defaults to 3.", withMinimum(1), withMaximum(10)),
			"start_coordinate": arraySchema(
				"(x, y): The starting coordinates for left_click_drag.",
				map[string]any{"type": "number"},
				withMinItems(2),
				withMaxItems(2),
			),
			"region": arraySchema(
				"(x0, y0, x1, y1): The rectangular region to capture for zoom. Required for zoom.",
				map[string]any{"type": "number"},
				withMinItems(4),
				withMaxItems(4),
			),
			"repeat":    numberSchema("Number of times to repeat the key sequence. Only applicable for key. Default is 1.", withMinimum(1), withMaximum(100)),
			"ref":       stringSchema("Element reference ID from read_page or find. Required for scroll_to. Can be used as an alternative to coordinate for click actions."),
			"modifiers": stringSchema("Modifier keys for click actions. Supports ctrl, shift, alt, cmd/meta, and win/windows. Can be combined with +."),
			"tabId":     numberSchema("Tab ID to execute the action on. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "action", "tabId"),
	},
	{
		name:        "find",
		description: "Find elements on the page using natural language. Can search for elements by their purpose (e.g., 'search bar', 'login button') or by text content (e.g., 'organic mango product'). Returns up to 20 matching elements with references that can be used with other tools. If more than 20 matches exist, you'll be notified to use a more specific query. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"query": stringSchema("Natural language description of what to find, such as 'search bar' or 'add to cart button'."),
			"tabId": numberSchema("Tab ID to search in. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "query", "tabId"),
	},
	{
		name:        "form_input",
		description: "Set values in form elements using element reference ID from the read_page or find tools. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"ref": stringSchema("Element reference ID from read_page or find, such as 'ref_1'."),
			"value": map[string]any{
				"type":        []string{"string", "boolean", "number"},
				"description": "The value to set. For checkboxes use boolean, for selects use option value or text, and for other inputs use an appropriate string or number.",
			},
			"tabId": numberSchema("Tab ID to set the form value in. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "ref", "value", "tabId"),
	},
	{
		name:        "get_page_text",
		description: "Extract raw text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs. Output is limited to 50000 characters by default.",
		inputSchema: objectSchema(map[string]any{
			"tabId":     numberSchema("Tab ID to extract text from. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
			"max_chars": numberSchema("Maximum characters for output. Defaults to 50000."),
		}, "tabId"),
	},
	{
		name:        "read_page",
		description: "Get an accessibility tree representation of elements on the page. By default returns all elements including non-visible ones. Can optionally filter for only interactive elements, limit tree depth, or focus on a specific element. Returns a structured tree that represents how screen readers see the page content. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs. Output is limited to 50000 characters - if exceeded, specify a depth limit or ref_id to focus on a specific element.",
		inputSchema: objectSchema(map[string]any{
			"filter":    stringSchema("Filter elements: 'interactive' for buttons/links/inputs only, 'all' for all elements.", withEnum("interactive", "all")),
			"tabId":     numberSchema("Tab ID to read from. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
			"depth":     numberSchema("Maximum depth of the tree to traverse. Defaults to 15."),
			"ref_id":    stringSchema("Reference ID of a parent element to read. Use this to focus on a specific part of the page."),
			"max_chars": numberSchema("Maximum characters for output. Defaults to 50000."),
		}, "tabId"),
	},
	{
		name:        "resize_window",
		description: "Resize the current browser window to specified dimensions. Useful for testing responsive designs or setting up specific screen sizes. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"width":  numberSchema("Target window width in pixels."),
			"height": numberSchema("Target window height in pixels."),
			"tabId":  numberSchema("Tab ID to get the window for. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
		}, "width", "height", "tabId"),
	},
	{
		name:        "turn_answer_start",
		description: "Call this immediately before your text response to the user for this turn. Required every turn - whether or not you made tool calls. After calling, write your response. No more tools after this.",
		inputSchema: objectSchema(map[string]any{}),
	},
	{
		name:        "update_plan",
		description: "Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts.",
		inputSchema: objectSchema(map[string]any{
			"domains":  arraySchema("List of domains you will visit. These domains will be approved for the session when the user accepts the plan.", map[string]any{"type": "string"}),
			"approach": arraySchema("High-level description of what you will do. Focus on outcomes and key actions, not implementation details.", map[string]any{"type": "string"}),
		}, "domains", "approach"),
	},
	{
		name:        "upload_image",
		description: "Upload a previously captured screenshot or user-uploaded image to a file input or drag and drop target. Supports two approaches: (1) ref - for targeting specific elements, especially hidden file inputs, (2) coordinate - for drag and drop to visible locations like Google Docs. Provide either ref or coordinate, not both.",
		inputSchema: objectSchema(map[string]any{
			"imageId":    stringSchema("ID of a previously captured screenshot or a user-uploaded image."),
			"ref":        stringSchema("Element reference ID from read_page or find. Use this for file inputs or specific elements. Provide either ref or coordinate, not both."),
			"coordinate": arraySchema("Viewport coordinates [x, y] for drag and drop to a visible location. Provide either ref or coordinate, not both.", map[string]any{"type": "number"}),
			"tabId":      numberSchema("Tab ID where the target element is located."),
			"filename":   stringSchema("Optional filename for the uploaded file. Defaults to image.png."),
		}, "imageId", "tabId"),
	},
	{
		name:        "read_console_messages",
		description: "Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab. Useful for debugging JavaScript errors, viewing application logs, or understanding what's happening in the browser console. Returns console messages from the current domain only. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs. IMPORTANT: Always provide a pattern to filter messages - without a pattern, you may get too many irrelevant messages.",
		inputSchema: objectSchema(map[string]any{
			"tabId":      numberSchema("Tab ID to read console messages from. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
			"onlyErrors": booleanSchema("If true, only return error and exception messages. Defaults to false."),
			"clear":      booleanSchema("If true, clear the console messages after reading. Defaults to false."),
			"pattern":    stringSchema("Regex pattern to filter console messages."),
			"limit":      numberSchema("Maximum number of messages to return. Defaults to 100."),
		}, "tabId"),
	},
	{
		name:        "read_network_requests",
		description: "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.",
		inputSchema: objectSchema(map[string]any{
			"tabId":      numberSchema("Tab ID to read network requests from. Must be a tab in the current MCP tab group. Use tabs_context_mcp first if needed."),
			"urlPattern": stringSchema("Optional URL pattern to filter requests. Only requests whose URL contains this string are returned."),
			"clear":      booleanSchema("If true, clear the network requests after reading. Defaults to false."),
			"limit":      numberSchema("Maximum number of requests to return. Defaults to 100."),
		}, "tabId"),
	},
	{
		name:        "gif_creator",
		description: "Manage GIF recording and export for browser automation sessions. Control when to start/stop recording browser actions (clicks, scrolls, navigation), then export as an animated GIF with visual overlays (click indicators, action labels, progress bar, watermark). All operations are scoped to the tab's group. When starting recording, take a screenshot immediately after to capture the initial state as the first frame. When stopping recording, take a screenshot immediately before to capture the final state as the last frame. For export, either provide 'coordinate' to drag and drop upload to a page element, or set 'download: true' to download the GIF.",
		inputSchema: objectSchema(map[string]any{
			"action": stringSchema(
				"Action to perform: start_recording, stop_recording, export, or clear.",
				withEnum("start_recording", "stop_recording", "export", "clear"),
			),
			"tabId":      numberSchema("Tab ID to identify which tab group this operation applies to."),
			"coordinate": arraySchema("Viewport coordinates [x, y] for drag-and-drop upload. Required for export unless download is true.", map[string]any{"type": "number"}),
			"download":   booleanSchema("If true, download the GIF instead of drag-and-drop upload. For export only."),
			"filename":   stringSchema("Optional filename for the exported GIF. Defaults to recording-[timestamp].gif."),
			"options": objectProperty(
				"Optional GIF enhancement options for export.",
				map[string]any{
					"showClickIndicators": booleanSchema("Show orange circles at click locations. Defaults to true."),
					"showDragPaths":       booleanSchema("Show red arrows for drag actions. Defaults to true."),
					"showActionLabels":    booleanSchema("Show black labels describing actions. Defaults to true."),
					"showProgressBar":     booleanSchema("Show orange progress bar at the bottom. Defaults to true."),
					"showWatermark":       booleanSchema("Show SuperDuck logo watermark. Defaults to true."),
					"quality":             numberSchema("GIF compression quality, 1-30. Lower is better quality, slower encoding. Defaults to 10."),
				},
			),
		}, "action", "tabId"),
	},
	{
		name:        "tabs_context_mcp",
		description: "Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Each new conversation should create its own new tab (using tabs_create_mcp) rather than reusing existing tabs, unless the user explicitly asks to use an existing tab.",
		inputSchema: objectSchema(map[string]any{
			"createIfEmpty": booleanSchema("Creates a new MCP tab group if none exists. If one already exists, this has no effect."),
		}),
	},
	{
		name:        "tabs_create_mcp",
		description: "Creates a new empty tab in the MCP tab group.",
		inputSchema: objectSchema(map[string]any{}),
	},
	{
		name:        "shortcuts_list",
		description: "List all available shortcuts and workflows (shortcuts and workflows are interchangeable). Returns shortcuts with their commands, descriptions, and whether they are workflows. Use shortcuts_execute to run a shortcut or workflow.",
		inputSchema: objectSchema(map[string]any{}),
	},
	{
		name:        "shortcuts_get",
		description: "Fetch the raw prompt text of a shortcut by id or command, without executing it. Use this when you want to retrieve the shortcut definition and run it locally.",
		inputSchema: objectSchema(map[string]any{
			"shortcutId": stringSchema("The ID of the shortcut to fetch."),
			"command":    stringSchema("The command name of the shortcut to fetch, without the leading slash."),
		}),
	},
	{
		name:        "shortcuts_execute",
		description: "Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.",
		inputSchema: objectSchema(map[string]any{
			"shortcutId": stringSchema("The ID of the shortcut to execute."),
			"command":    stringSchema("The command name of the shortcut to execute, without the leading slash."),
		}),
	},
}
