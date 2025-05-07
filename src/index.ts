import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const NWS_API_BASE = "https://api.weather.gov/";
const USER_AGENT = "weather-app/1.0";

const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {
            "get-alerts": {
                description: "Get weather alerts for a state",
                parameters: {
                    type: "object",
                    properties: {
                        state: {
                            type: "string",
                            description: "Two-letter state code",
                            minLength: 2,
                            maxLength: 2
                        }
                    },
                    required: ["state"]
                }
            }
        },
    }
});

async function makeNWSRequest<T>(url: string): Promise<T | null> {
    const headers = {
        "User-Agent": USER_AGENT,
        accept: "application/geo+json",
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return (await response.json()) as T;
    } catch (error) {
        console.error(`Error making NWS request:`, error);
        return null;
    }
}

interface AlertFeature {
    properties: {
        event?: string;
        areaDesc?: string;
        severity?: string;
        status?: string;
        headline?: string;
    };
}

interface AlertsResponse {
    features: AlertFeature[];
}

interface ForecastPeriod {
    name?: string;
    temperature?: number;
    temperatureUnit?: string;
    windSpeed?: string;
    windDirection?: string;
    shortForecast?: string;
}

interface PointsResponse {
    properties: {
        forecast?: string;
    };
}

interface ForecastResponse {
    properties: {
        periods: ForecastPeriod[];
    };
}

function formatAlert(feature: AlertFeature) {
    const props = feature.properties;
    return [
        `event: ${props.event || "Unknown Event"}`,
        `area: ${props.areaDesc || "Unknown Area"}`,
        `severity: ${props.severity || "Unknown Severity"}`,
        `status: ${props.status || "Unknown Status"}`,
        `headline: ${props.headline || "Unknown Headline"}`,
    ].join("\n");
}

server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
        state: z.string().length(2).describe("Two-letter state code"),
    },
    async ({ state }) => {
        const stateCode = state.toUpperCase();
        const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
        const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

        if (!alertsData) {
            return {
                content: [{
                    type: "text",
                    text: "Failed to retrieve alerts. Please try again later.",
                }],
            };
        }

        const features = alertsData.features || [];
        if (features.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "No alerts found for the given state.",
                }],
            };
        }

        const formattedAlerts = features.map(formatAlert);
        const alertsText = `Active Alerts in ${stateCode}:\n${formattedAlerts.join("\n\n")}`;

        return {
            content: [{
                type: "text",
                text: alertsText,
            }],
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.info("Weather server is running. Press Ctrl+C to stop.");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});