/**
 * NoiseModelling is an open-source tool designed to produce environmental noise maps
 * on very large urban areas. It can be used as a Java library or be controlled through
 * a user friendly web interface.
 *
 * This version is developed by the DECIDE team from the Lab-STICC (CNRS) and by the
 * Mixt Research Unit in Environmental Acoustics (Université Gustave Eiffel).
 * <http://noise-planet.org/noisemodelling.html>
 *
 * NoiseModelling is distributed under GPL 3 license. You can read a copy of this
 * License in the file LICENCE provided with this software.
 *
 * Contact: contact@noise-planet.org
 */

/**
 * @Author Pierre Aumond, Université Gustave Eiffel
 * @Author Nicolas Fortin, Université Gustave Eiffel
 */


import groovy.sql.Sql
import org.noise_planet.noisemodelling.scripts.Acoustic_Tools.Create_Isosurface
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Road_Emission_from_Traffic
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Noise_level_from_source
import org.noise_planet.noisemodelling.scripts.Receivers.Delaunay_Grid
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Export_Table
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Import_File
import org.h2gis.utilities.JDBCUtilities


import java.lang.management.ManagementFactory
import java.lang.management.ThreadInfo
import java.lang.management.ThreadMXBean
import java.sql.Connection
import java.text.DecimalFormat
import java.util.concurrent.TimeUnit
import groovy.json.JsonSlurper
import groovy.json.JsonOutput


title = 'NoiseModelling benchmark simulation'
description = 'NoiseModelling benchmark simulation'

inputs = [
        NM_version:[
                title      : 'Version of NoiseModelling',
                name       : 'Version of NoiseModelling',
                description: 'Version of NoiseModellingd.',
                min        : 0, max: 1,
                type       : String.class,
        ]]

outputs = [result: [name: 'Result output string', title: 'Result output string', description: 'This type of result does not allow the blocks to be linked together.', type: String.class]]

private static String threadDump(boolean lockedMonitors, boolean lockedSynchronizers) {
    StringBuffer threadDump = new StringBuffer(System.lineSeparator());
    ThreadMXBean threadMXBean = ManagementFactory.getThreadMXBean();
    for(ThreadInfo threadInfo : threadMXBean.dumpAllThreads(lockedMonitors, lockedSynchronizers)) {
        threadDump.append(threadInfo.toString());
    }
    return threadDump.toString();
}

static def exec(Connection connection, Map input) {
    String version=""
    if(input.containsKey('NM_version')){
        version=input["NM_version"] as String
    }
    def outputFolder = new File("benchmark/output/$version")
    if (!outputFolder.exists()) {
        outputFolder.mkdir()
    }
    def redoDelaunayGrid = false
    def redoRoadsEmission = false
    def redoCompute = true
    def sql = new Sql(connection)

    def bench = new GroovyClassLoader()
            .parseClass(new File("benchmark/simulations/lib/NoiseBench.groovy"))
            .newInstance()

    def config = new JsonSlurper().parse(new File("benchmark/config/benchmark.json"))
    double silenceThreshold = config.constants.silenceThreshold as double
    def bins = config.constants.histogramBins as List


    long tStep = System.currentTimeMillis()
    def logPhase = { String name ->
        println("PHASE ${name}: ${(System.currentTimeMillis() - tStep) / 1000} s")
        tStep = System.currentTimeMillis()
    }

    if (!JDBCUtilities.tableExists(connection, "BUILDINGS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/BUILDINGS.geojson",
                 "inputSRID": "2154",
                 "tableName": "BUILDINGS"])
    }

    if (!JDBCUtilities.tableExists(connection, "DEM")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/DEM.geojson",
                 "inputSRID": 2154,
                 "tableName": "DEM"])
    }


    if (!JDBCUtilities.tableExists(connection, "GROUNDS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/GROUNDS.geojson",
                 "inputSRID": "2154",
                 "tableName": "GROUNDS"])
    }

    if (!JDBCUtilities.tableExists(connection, "LW_ROADS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/LW_ROADS.geojson",
                 "inputSRID": "2154",
                 "tableName": "LW_ROADS"])
    }

    if (!JDBCUtilities.tableExists(connection, "RECEIVERS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/RECEIVERS.geojson",
                 "inputSRID": "2154",
                 "tableName": "RECEIVERS"])
    }

    if (!JDBCUtilities.tableExists(connection, "TRIANGLES")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/clisson/clisson/TRIANGLES.geojson",
                 "inputSRID": "2154",
                 "tableName": "TRIANGLES"])
    }

    logPhase("imports")

    if (redoDelaunayGrid) {
        sql.execute("DROP TABLE RECEIVERS IF EXISTS")

        if (!JDBCUtilities.tableExists(connection, "RECEIVERS")) {
            new Delaunay_Grid().exec(connection,
                    ["tableBuilding"      : "BUILDINGS",
                     "maxArea"            : 2500,
                     "sourcesTableName"   : "ROADS",
                     "fenceNegativeBuffer": 3500,
                     "maxCellDist"        : 2000])
        }

        new Export_Table().exec(connection,
                ["exportPath"   : "benchmark/input/clisson/RECEIVERS.shp",
                 "tableToExport": "RECEIVERS"])

        new Export_Table().exec(connection,
                ["exportPath"   : "benchmark/input/clisson/TRIANGLES.shp",
                 "tableToExport": "TRIANGLES"])
    }

    if (redoRoadsEmission) {
        if (!JDBCUtilities.tableExists(connection, "ROADS")) {
            new Import_File().exec(connection,
                    ["pathFile" : "benchmark/input/clisson/clisson/ROADS.geojson",
                     "inputSRID": "2154",
                     "tableName": "ROADS"])
        }

        new Road_Emission_from_Traffic().exec(connection,
                ["tableRoads": "ROADS"])

        sql.execute("DELETE FROM LW_ROADS WHERE THE_GEOM IS NULL")

        new Export_Table().exec(connection,
                ["exportPath"   : "benchmark/input/clisson/LW_ROADS.shp",
                 "tableToExport": "LW_ROADS"])

        sql.execute("DROP TABLE IF EXISTS LW_ROADS_LW")

        sql.execute("CREATE TABLE LW_ROADS_LW AS SELECT * FROM LW_ROADS")

        def fields = ["HZD63", "HZD125", "HZD250", "HZD500", "HZD1000", "HZD2000", "HZD4000", "HZD8000", "HZE63",
                      "HZE125", "HZE250", "HZE500", "HZE1000", "HZE2000", "HZE4000", "HZE8000", "HZN63", "HZN125",
                      "HZN250", "HZN500", "HZN1000", "HZN2000", "HZN4000", "HZN8000"]
        fields.forEach {
            field ->
                def fieldLw = field.replace("HZ", "LW")
                sql.execute("ALTER TABLE LW_ROADS_LW RENAME COLUMN $field TO $fieldLw" as String)
        }

        new Export_Table().exec(connection,
                ["exportPath"   : "benchmark/input/clisson/LW_ROADS_LW.shp",
                 "tableToExport": "LW_ROADS_LW"])

    }
    logPhase("preparation")

    long elapsed = 0
    def runner = "v6-generic"

    if(redoCompute) {

        long startCompute = System.currentTimeMillis()

        def customScripts = [
                "v6.0.0"         : "benchmark/simulations/v6Noise_level_from_source.groovy",
                "v6.0.1"         : "benchmark/simulations/v601Noise_level_from_source.groovy",
                "v6.0.2-SNAPSHOT": "benchmark/simulations/v602Noise_level_from_source.groovy"
        ]
        def scriptPath = customScripts[version]

        if(scriptPath != null){
            runner = "v6-custom"

            def scriptFile = new File(scriptPath)
                    .getAbsoluteFile()

            if (!scriptFile.exists()) {
                throw new FileNotFoundException("Fichier introuvable : ${scriptFile.absolutePath}")
            }

            def customClass = new GroovyClassLoader().parseClass(scriptFile)
            def customScript = customClass.newInstance()
            customScript.exec(connection, [
                    "tableBuilding" : "BUILDINGS",
                    "tableSources"      : "LW_ROADS",
                    "tableReceivers"    : "RECEIVERS",
                    "tableDEM"          : "DEM",
                    "tableGroundAbs"    : "GROUNDS",
                    "confReflOrder"     : 1,
                    "confMaxSrcDist"    : 300,
                    "confDiffHorizontal": true,
                    "confMaxError": 0.1,
                    "confFavorableOccurrencesDefault":'0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25',
                    "confRecordProfile": true,
                    "confProfilePath": "$outputFolder/profile.csv"
            ])
        }
        else{

                 new Noise_level_from_source().exec(connection, config.models.clisson.exec)
        }
        
        elapsed = System.currentTimeMillis() - startCompute


        new Export_Table().exec(connection,
                ["exportPath"   : "$outputFolder/RECEIVERS_LEVEL.geojson",
                 "tableToExport": "RECEIVERS_LEVEL"])

    }

    logPhase("compute")

    // Comptage estime : mediane par recepteur x nombre de recepteurs.
    // La colonne receiver_median_rays n'existe qu'en v4 ; la v5+ expose
    // receiver_median_profiles_count.
    int receiverCount = sql.firstRow("SELECT COUNT(*) FROM RECEIVERS")[0] as Integer
    def profileCsv = new File("$outputFolder/profile.csv")
    if (!profileCsv.exists()) {
        def candidates = new File(".").listFiles()?.findAll { it.name.startsWith("profile") && it.name.endsWith(".csv") }
        if (candidates) profileCsv = candidates.max { it.lastModified() }
    }
    def nbRays = bench.readNbRays(profileCsv, null) * receiverCount
    def nbProfiles = bench.readProfileCount(profileCsv, null) * receiverCount
    def timePerRays = nbRays > 0 ? elapsed / nbRays : 0
    def timePerProfiles = nbProfiles > 0 ? elapsed / nbProfiles : 0

    new Create_Isosurface().exec(connection,
            ["resultTable": "RECEIVERS_LEVEL",
             "keepTriangles": false,
             "smoothCoefficient" : 0])

    sql.execute("DROP TABLE IF EXISTS KEPLERGL")

    sql.execute("CREATE TABLE KEPLERGL AS SELECT ST_Transform(THE_GEOM, 4326) THE_GEOM, ISOLABEL FROM CONTOURING_NOISE_MAP WHERE PERIOD='DEN'")

    new Export_Table().exec(connection,
            ["exportPath"   : "$outputFolder/ISO_CONTOUR.geojson",
             "tableToExport": "KEPLERGL"])

    logPhase("isosurface+export")

    threadDump(true, true)


    def cpt = sql.firstRow("SELECT COUNT(*) FROM RECEIVERS")[0] as Integer
    double time = elapsed/cpt

    long hours = TimeUnit.MILLISECONDS.toHours(elapsed)
    elapsed -= TimeUnit.HOURS.toMillis(hours)
    long minutes = TimeUnit.MILLISECONDS.toMinutes(elapsed)
    elapsed -= TimeUnit.MINUTES.toMillis(minutes)
    long seconds = TimeUnit.MILLISECONDS.toSeconds(elapsed)
    String timeString = String.format(Locale.ROOT, "%02d:%02d:%02d", hours, minutes, seconds)

    println("Compuation of $cpt receivers in $timeString ( ${time} milliseconds per receiver")

    def stats = bench.computeLevelStats(new File("$outputFolder/RECEIVERS_LEVEL.geojson"), true, silenceThreshold, bins)

    DecimalFormat f = new DecimalFormat()
    f.setMaximumFractionDigits(2)


    def result = [
            mean: stats.mean,
            time: timeString,
            timePerReceive: f.format(time),
            java: System.getProperty("java.version"),
            runner: runner,
            nbRays: nbRays,
            nbProfiles: nbProfiles,
            timePerRays: timePerRays,
            timePerProfiles: timePerProfiles,
            nNan: stats.nNan,
            silenceThreshold: silenceThreshold,
            histogram: stats.histogram
    ]

    def outFile = new File("$outputFolder/stats_${version}.json")
    outFile.text = JsonOutput.prettyPrint(JsonOutput.toJson(result))

    println("fini***************************************************************************")

    System.exit(0)
}
