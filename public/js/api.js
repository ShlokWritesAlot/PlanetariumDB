/**
 * API Client for Planetarium DB
 * Handles REST requests and Server-Sent Events (SSE) subscriptions
 */
const API = {
    async fetchPlanets() {
        const res = await fetch('/api/planets');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch planets');
        return json.data;
    },

    async createPlanet(planetData) {
        const res = await fetch('/api/planets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(planetData)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.detail || json.error || 'Failed to create planet');
        }
        return json;
    },

    async createPlanetWithMoons(payload) {
        const res = await fetch('/api/planets/with-moons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.detail || json.error || 'Failed to create planet with moons');
        }
        return json;
    },

    async updatePlanet(id, planetData) {
        const res = await fetch(`/api/planets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(planetData)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.detail || json.error || 'Failed to update planet');
        }
        return json;
    },

    async deletePlanet(id) {
        const res = await fetch(`/api/planets/${id}`, {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.detail || json.error || 'Failed to delete planet');
        }
        return json;
    },

    async fetchStats() {
        const res = await fetch('/api/stats');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch analytics');
        return json.data;
    },

    async fetchAuditLogs() {
        const res = await fetch('/api/audit?limit=25');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch audit logs');
        return json.data;
    },

    /**
     * Subscribes to Server-Sent Events at /api/events
     * Automatically triggers onPlanetChangeCallback whenever Postgres notifies of INSERT/UPDATE/DELETE.
     */
    initRealtimeEvents(onPlanetChangeCallback, onStatusCallback) {
        if (!window.EventSource) {
            console.warn('Browser does not support Server-Sent Events (SSE).');
            return null;
        }

        const eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
            console.log('🟢 SSE connection established to /api/events');
            if (onStatusCallback) onStatusCallback({ connected: true });
        };

        eventSource.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('⚡ SSE message received from Postgres:', message);

                // When database changes occur on planets or moons, refetch
                if (message.event === 'db_change') {
                    if (onPlanetChangeCallback) {
                        onPlanetChangeCallback(message.data);
                    }
                }
            } catch (err) {
                console.error('Error parsing SSE event payload:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.warn('⚠️ SSE connection lost or reconnecting...', err);
            if (onStatusCallback) onStatusCallback({ connected: false });
        };

        return eventSource;
    }
};

window.API = API;
