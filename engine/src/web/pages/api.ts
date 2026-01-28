import fs from 'fs';
import { findPath, findLongPath, isZoneAllocated } from '#/engine/GameMap.js';
import { tryParseInt } from '#/util/TryParse.js';

export async function handleScreenshotUpload(req: Request, url: URL): Promise<Response | null> {
    if (url.pathname !== '/api/screenshot' || req.method !== 'POST') {
        return null;
    }

    try {
        const data = await req.text();
        const base64Data = data.replace(/^data:image\/png;base64,/, '');
        const filename = `screenshot-${Date.now()}.png`;
        const filepath = `screenshots/${filename}`;
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
        return new Response(JSON.stringify({ success: true, filename }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export function handleFindPathApi(url: URL): Response | null {
    if (url.pathname !== '/api/findPath') {
        return null;
    }

    try {
        const srcX = tryParseInt(url.searchParams.get('srcX'), -1);
        const srcZ = tryParseInt(url.searchParams.get('srcZ'), -1);
        const destX = tryParseInt(url.searchParams.get('destX'), -1);
        const destZ = tryParseInt(url.searchParams.get('destZ'), -1);
        const level = tryParseInt(url.searchParams.get('level'), 0);
        const maxWaypoints = tryParseInt(url.searchParams.get('maxWaypoints'), 500);
        const useLongPath = url.searchParams.get('useLongPath') !== 'false';

        if (srcX < 0 || srcZ < 0 || destX < 0 || destZ < 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required parameters: srcX, srcZ, destX, destZ'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const srcZoneAllocated = isZoneAllocated(level, srcX, srcZ);
        const destZoneAllocated = isZoneAllocated(level, destX, destZ);

        if (!srcZoneAllocated || !destZoneAllocated) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Zone not allocated (collision data not loaded)',
                srcZoneAllocated,
                destZoneAllocated
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const waypointsRaw = useLongPath
            ? findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints)
            : findPath(level, srcX, srcZ, destX, destZ);

        const waypoints: Array<{ x: number; z: number; level: number }> = [];
        for (let i = 0; i < waypointsRaw.length; i++) {
            const packed = waypointsRaw[i];
            waypoints.push({
                z: packed & 0x3FFF,
                x: (packed >> 14) & 0x3FFF,
                level: (packed >> 28) & 0x3
            });
        }

        return new Response(JSON.stringify({
            success: true,
            waypoints,
            waypointCount: waypoints.length,
            reachedDestination: waypoints.length > 0 &&
                waypoints[waypoints.length - 1].x === destX &&
                waypoints[waypoints.length - 1].z === destZ,
            usedLongPath: useLongPath
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({
            success: false,
            error: e.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
