/**
 * Compare your own implementation with NoiseModelling on the Clisson dataset.
 *
 * Clisson is a road-traffic scene (line sources, a full urban noise map).
 * A full run with the parameters below typically takes ~15 minutes on a
 * GitHub Actions runner.
 *
 * Usage:
 *   ScriptRunner -w workspace -s compare_clisson.groovy
 *   ScriptRunner -w workspace -s compare_clisson.groovy --datasetDir clisson
 *
 * Expected layout (relative to the working directory):
 *   clisson/BUILDINGS.geojson
 *   clisson/DEM.geojson
 *   clisson/GROUNDS.geojson
 *   clisson/LW_ROADS.geojson
 *   clisson/RECEIVERS.geojson
 *
 * Output:
 *   output/RECEIVERS_LEVEL.geojson  (LAEQ per receiver and period)
 *
 * The parameters below are the ones used by the published benchmark.
 */

import org.h2gis.utilities.JDBCUtilities
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Export_Table
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Import_File
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Noise_level_from_source
import java.sql.Connection

title = 'Compare your software with NoiseModelling — Clisson'
description = '''Run NoiseModelling on the Clisson benchmark dataset and export the sound levels at the receivers.
Expected files in the dataset folder: BUILDINGS.geojson, DEM.geojson, GROUNDS.geojson, LW_ROADS.geojson, RECEIVERS.geojson.'''

inputs = [
        datasetDir: [
                title      : 'Dataset folder',
                name       : 'Dataset folder',
                description: 'Folder containing the Clisson GeoJSON files (default: clisson)',
                min        : 0, max: 1,
                type       : String.class,
        ]]

outputs = [result: [name: 'Result output string', title: 'Result output string', description: 'Path of the exported receiver levels', type: String.class]]

static def exec(Connection connection, Map input) {
    String datasetDir = (input != null && input["datasetDir"]) ? input["datasetDir"] as String : "clisson"

    if (!JDBCUtilities.tableExists(connection, "BUILDINGS")) {
        new Import_File().exec(connection, ["pathFile": "$datasetDir/BUILDINGS.geojson", "inputSRID": 2154, "tableName": "BUILDINGS"])
    }
    if (!JDBCUtilities.tableExists(connection, "DEM")) {
        new Import_File().exec(connection, ["pathFile": "$datasetDir/DEM.geojson", "inputSRID": 2154, "tableName": "DEM"])
    }
    if (!JDBCUtilities.tableExists(connection, "GROUNDS")) {
        new Import_File().exec(connection, ["pathFile": "$datasetDir/GROUNDS.geojson", "inputSRID": 2154, "tableName": "GROUNDS"])
    }
    if (!JDBCUtilities.tableExists(connection, "LW_ROADS")) {
        new Import_File().exec(connection, ["pathFile": "$datasetDir/LW_ROADS.geojson", "inputSRID": 2154, "tableName": "LW_ROADS"])
    }
    if (!JDBCUtilities.tableExists(connection, "RECEIVERS")) {
        new Import_File().exec(connection, ["pathFile": "$datasetDir/RECEIVERS.geojson", "inputSRID": 2154, "tableName": "RECEIVERS"])
    }

    new Noise_level_from_source().exec(connection,
            ["tableBuilding"     : "BUILDINGS",
             "tableSources"      : "LW_ROADS",
             "tableReceivers"    : "RECEIVERS",
             "tableDEM"          : "DEM",
             "tableGroundAbs"    : "GROUNDS",
             "confReflOrder"     : 1,
             "confMaxSrcDist"    : 300,
             "confDiffHorizontal": true,
             "confMaxError"      : 0.1,
             "confFavorableOccurrencesDefault": "0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25"])

    new Export_Table().exec(connection,
            ["exportPath"   : "output/RECEIVERS_LEVEL.geojson",
             "tableToExport": "RECEIVERS_LEVEL"])

    return "output/RECEIVERS_LEVEL.geojson"
}
