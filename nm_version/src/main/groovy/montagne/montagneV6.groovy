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
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Noise_level_from_source
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Export_Table
import org.noise_planet.noisemodelling.scripts.Geometric_Tools.Set_Height
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
    def outputFolder = new File("output/montagne/$version")
    if (!outputFolder.exists()) {
        outputFolder.mkdir()
    }
    def redoDelaunayGrid = false
    def redoRoadsEmission = false
    def redoCompute = true
    def sql = new Sql(connection)

    def bench = new GroovyClassLoader()
            .parseClass(new File("nm_version/src/main/groovy/lib/NoiseBench.groovy"))
            .newInstance()

    def config = new JsonSlurper().parse(new File("config/benchmark.json"))
    double silenceThreshold = config.constants.silenceThreshold as double
    def bins = config.constants.histogramBins as List

    if (!JDBCUtilities.tableExists(connection, "BUILDINGS")) {
        new Import_File().exec(connection,
                ["pathFile" : "input/montagne/BUILDINGS.geojson",
                 "inputSRID": "2154",
                 "tableName": "BUILDINGS"])
    }

    if (!JDBCUtilities.tableExists(connection, "DEM")) {
        new Import_File().exec(connection,
                ["pathFile" : "input/montagne/DEM.geojson",
                 "inputSRID": 2154,
                 "tableName": "DEM"])
    }

    if (!JDBCUtilities.tableExists(connection, "GROUNDS")) {
        new Import_File().exec(connection,
                ["pathFile" : "input/montagne/GROUNDS.geojson",
                 "inputSRID": "2154",
                 "tableName": "GROUNDS"])
    }

    if (!JDBCUtilities.tableExists(connection, "LW_ROADS")) {
        new Import_File().exec(connection,
                ["pathFile" : "input/montagne/LW_ROADS.geojson",
                 "inputSRID": 2154,
                 "tableName": "LW_ROADS"])

    }

    if (!JDBCUtilities.tableExists(connection, "RECEIVERS")) {
        new Import_File().exec(connection,
                ["pathFile" : "input/montagne/RECEIVERS.geojson",
                 "inputSRID": "2154",
                 "tableName": "RECEIVERS"])
    }

    long elapsed = 0

    if(redoCompute) {

        long startCompute = System.currentTimeMillis()
            config.models.montagne.setHeight.each { h ->
                new Set_Height().exec(connection, ["tableName": h.tableName, "height": h.height])
            }

            new Noise_level_from_source().exec(connection, config.models.montagne.exec)

        elapsed = System.currentTimeMillis() - startCompute
        sql.execute("DROP TABLE IF EXISTS RECEIVERS_LEVEL_D")

        sql.execute("CREATE TABLE RECEIVERS_LEVEL_D AS SELECT * FROM RECEIVERS_LEVEL WHERE PERIOD='D'")


        new Export_Table().exec(connection,
                ["exportPath"   : "$outputFolder/RECEIVERS_LEVEL.geojson",
                 "tableToExport": "RECEIVERS_LEVEL_D"])

    }

    threadDump(true, true)


    def cpt = sql.firstRow("SELECT COUNT(*) FROM RECEIVERS")[0] as Integer
    def nbRays =  sql.firstRow("SELECT COUNT(*) FROM RAYS")[0] as Integer
    double time = elapsed/cpt
    def timeray = 0
    if (nbRays != 0) {
        timeray = elapsed/nbRays
    }

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
            runner: "montagne-v6",
            nbRays : nbRays,
            nNan: stats.nNan,
            silenceThreshold: silenceThreshold,
            timePerRays: timeray,
            histogram: stats.histogram
    ]

    def outFile = new File("$outputFolder/stats_${version}.json")
    outFile.text = JsonOutput.prettyPrint(JsonOutput.toJson(result))

    println("fini***************************************************************************")

    System.exit(0)
}
