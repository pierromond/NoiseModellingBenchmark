/**
 * Compare your own implementation with NoiseModelling on the La Montagne dataset.
 *
 * La Montagne is a single point source (a siren mounted 1 m above a building
 * roof) with 10 measurement points. A full run typically takes less than a
 * minute on a GitHub Actions runner.
 *
 * Usage:
 *   ScriptRunner -w workspace -s compare_montagne.groovy
 *   ScriptRunner -w workspace -s compare_montagne.groovy --datasetDir montagne
 *
 * Expected layout (relative to the working directory):
 *   montagne/BUILDINGS.geojson
 *   montagne/DEM.geojson
 *   montagne/GROUNDS.geojson
 *   montagne/LW_ROADS.geojson
 *   montagne/RECEIVERS.geojson
 *
 * Output:
 *   output/RECEIVERS_LEVEL.geojson  (LAEQ per receiver)
 *
 * The parameters below are the ones used by the published benchmark.
 */

import org.h2gis.utilities.JDBCUtilities
import org.noise_planet.noisemodelling.scripts.Geometric_Tools.Set_Height
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Export_Table
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Import_File
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Noise_level_from_source
import java.sql.Connection

title = 'Compare your software with NoiseModelling — La Montagne'
description = '''Run NoiseModelling on the La Montagne benchmark dataset and export the sound levels at the receivers.
Expected files in the dataset folder: BUILDINGS.geojson, DEM.geojson, GROUNDS.geojson, LW_ROADS.geojson, RECEIVERS.geojson.'''

inputs = [
        datasetDir: [
                title      : 'Dataset folder',
                name       : 'Dataset folder',
                description: 'Folder containing the La Montagne GeoJSON files (default: montagne)',
                min        : 0, max: 1,
                type       : String.class,
        ]]

outputs = [result: [name: 'Result output string', title: 'Result output string', description: 'Path of the exported receiver levels', type: String.class]]

static def exec(Connection connection, Map input) {
    String datasetDir = (input != null && input["datasetDir"]) ? input["datasetDir"] as String : "montagne"

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

    new Set_Height().exec(connection,
            ["tableName": "LW_ROADS",
             "height"   : 12.4])
    new Set_Height().exec(connection,
            ["tableName": "RECEIVERS",
             "height"   : 1.5])

    new Noise_level_from_source().exec(connection,
            ["tableBuilding"     : "BUILDINGS",
             "tableSources"      : "LW_ROADS",
             "tableReceivers"    : "RECEIVERS",
             "tableDEM"          : "DEM",
             "tableGroundAbs"    : "GROUNDS",
             "confRaysName"      : "RAYS",
             "confReflOrder"     : 2,
             "confMaxReflDist"   : 500,
             "confDiffVertical"  : true,
             "confMaxSrcDist"    : 10000,
             "confDiffHorizontal": true,
             "confTemperature"   : 24,
             "confExportSourceId": false,
             "confMaxError"      : 0,
             "confFavorableOccurrencesDefault": "0.5, 0.5, 0.75, 1.0, 0.75, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.0, 0.25, 0.5, 0.5, 0.5"])

    new Export_Table().exec(connection,
            ["exportPath"   : "output/RECEIVERS_LEVEL.geojson",
             "tableToExport": "RECEIVERS_LEVEL"])

    return "output/RECEIVERS_LEVEL.geojson"
}
