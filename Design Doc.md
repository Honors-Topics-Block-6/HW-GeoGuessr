# **Harvard-Westlake GeoGuessr**

**Design Document**

---

## **Main Purpose**

Harvard-Westlake GeoGuessr is a campus-based location-guessing game inspired by GeoGuessr. Instead of using global street views, this version uses real photos taken by students across the Harvard-Westlake campus. Players are shown an image and must guess where the photographer was standing when the photo was taken.

The project’s main purpose is to create a fun, interactive way for students and visitors to explore the campus while also serving as a collaborative design project where students contribute content even if they are not programmers. By crowdsourcing images and locations, the game becomes richer, more challenging, and more representative of the real campus environment.

---

## **Expenses**

* Geoguessr pro for the group (4$ bucks a month)

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## **How the Game Works (User Perspective)**

When a player opens the Harvard-Westlake GeoGuessr website, they can start a new game immediately. Each game consists of **five rounds**, similar to the original GeoGuessr format.

In each round:

* The player is shown a single photo taken somewhere on campus.

* A simplified 2D campus map appears next to the image.

* If the location is inside a building, the player can select a floor (e.g., first or second floor).

* The player clicks on the map to place a marker where they believe the photographer was standing.

The goal is **not** to guess what object is in the photo, but rather the exact spot where the person who *took* the photo was located (not the subject of the photo).

After submitting their guess (or when time runs out), the game reveals:

* The correct location on the map

* The player’s guessed location

* A short panoramic video showing the surrounding area

* A brief text description of the spot

The player then moves on to the next round. At the end of five rounds, the game displays the player’s total score, which is based on how close their guesses were to the real locations and whether they selected the correct floor when relevant.

---

## **How Image Data Is Collected**

All game content is **user-submitted** by students in the class.

Contributors use a mobile app (or mobile-friendly website) to submit:

* A photo of a campus location

* A short panoramic video of the surrounding area

* The photographer’s location on a campus map

* The floor level of the location is inside a building

* A short written description of the location

The app automatically records an approximate GPS location, which the user can manually adjust on a campus map to ensure accuracy. This ensures that each image is linked to the exact spot where the photographer was standing.

By distributing this task across many students, the project builds a large and diverse collection of locations without requiring everyone to write code.

---

## **Products & Technical Approach**

The project consists of **two main products**:

### **1\. The Web App (Game Platform)**

This is the main site where anyone can play Harvard-Westlake GeoGuessr.

Key features include:

* Five-round guessing games

* A clickable 2D campus map

* Floor selection for multi-level buildings

* Scoring based on location accuracy

* Reveal screens with videos and descriptions

* Difficulty modes based on how hard images are for players

The web app is focused on providing a smooth, intuitive gameplay experience that mirrors GeoGuessr while being customized for the Harvard-Westlake campus.

---

### **2\. The Mobile App / Submission Interface**

This tool is used by students in the class to submit new locations.

Its purpose is to make collecting labeled image data fast and easy.

Key features include:

* Photo and video capture

* Automatic GPS detection

* Manual location correction on a campus map

* Floor selection

* Text description input

* Uploading to the central database

This interface allows non-coders to meaningfully contribute to the project by supplying high-quality data.

---

## **Social Approach (human written)**

*More than all the above sections, this one is most subject to change\!*

If permitted, the project will begin with a full class discussion to further flesh out details about the specific functionality of the game. Most pressingly, finding a way to ensure fun non-repetitive gameplay that lies at a reasonable challenge level. More specific details for how to achieve this are not fully present in this document as I truly do not know the best course of action for them (but firmly believe that this idea has enough merit that these things could be determined with enough smart minds brainstorming\!)

During the course of the development itself, it is proposed that the class divides themselves into teams (likely of varying sizes matching the level of work required):

* **Backend Development**: the inner functionality of the GeoGuessr clone, inclusive of all database calls (both for the likely large map/image files and the player scores). This will also include the implementation of live multiplayer, and will most likely be the largest team.  
* **User Experience and Website Design:** Drafting, first on paper/slides/Canva, designs for how the website should look, what buttons would exist, and their functionality. Once finalized, they would implement this design on the website, communicating with the Backend team to let them know what functionality is going to be required.  
* **Map Design:** Creating the topographic map of campus roughly based upon the GoogleMaps satellite data that integrates GPS data (since this map will likely be figurative, there very likely might want to be some non-linear scaling of GPS coordinates, possibly based on smoothly interpolating between known data points)  
* **Photo-capture App Development**: the auxiliary service that will enable clean capture of campus locations, not the game interface itself.  
* **Amateur Photographers**: The people actually creating locations for the game. This could either be a dedicated team, everyone in class, or both (one team is responsible but if others get inspired they can join in). 

If possible, having de facto leaders for each team (and a project manager for the whole thing) would be ideal to facilitate communication.   
Crucially, I believe much of the success of this project will come from its ability to be evenly split into sub-products for development, making a team of 20 or so kids far more manageable.

**Scoring**  
Below are guidelines to determine how users are scored based on distance and accuracy 

* Regular Games  
  * Score \= 5000 \* e-Penalty  \* LOGISTIC CURVE DISTANCE DO MATH LATER  
  * Make a graph of all sections based on how close they are to each other (e.g. Chalmers and Rugby and Quad are connected, Rugby and Seaver are connected, Seaver and Munger, Munger and Taper)  
    * Section penalty \= Each node you have to travel to get from your guess to the correct section is \+2 to penalty  
    * Floor penalty \= Wrong floor is \+1 if off by one, \+1.5 if off by two (0 if wrong building)  
    * Distance penalty \= (Distance to spot)/(square feet of roof of correct building)½ (Automatically is 0 if wrong building)  
    * Penalty \= Section \+ Floor \+ Distance  
* Hard Mode Games  
  * Score \= 50(100-t) \* e-Penalty , t \= time in seconds  
* PvP Games  
  * Damage \= difference between two players scores, health starts at 5000 or 10000 depending on “short” or “long” game  
  * Add small bonus for answering first in addition to regular accuracy calculations 

**User Experience**  
Below are suggested features to improve user experience and increase return interaction with the game. 

* User Profiles   
  * IGN (In game name), Profile picture, rank based on previous matches (like chess.com)  
  * Upon creating an account, give users the opportunity to customize and build their profile   
* PvP   
  * Similar to that of GeoGeusser, players should be able to play against each other in a versus gamemode (although this feature may be more difficult to implement)  
  * Additional option to play with friends, people can join the same lobby using the same generated code  
* Ranking  
  * Ranking levels should be determined based on outlines in the above scoring section   
  * Each game a user plays should contribute to their rank   
  * PvP games should contribute further to the user’s rank   
  * Hard mode games contribute more to user’s rank  
* Game Modes  
  * Easy, Medium and Hard Single player mode. These modes are defined by the categories of images they could get. use an algorithm to self sort the images into different difficulties based on how often people guess correctly (if they guess them correctly more often, it is an easy image, and vice versa.  
  * A multiplayer with custom battles with multiple different people, as well as a ranked 1v1 mode  
    * Similar to GeoGuessr Versus where you have HP and the player who is further from actual location loses HP based on how much further off they were compared to the closer player, with the penalty becoming significantly stronger over time.  
  * Time is counted towards the total score in hard mode  
  * Additional custom modes suggested by the community that can be implemented by the devs such as 1 second mode to see the picture and then guess  
  * A race mode, where players have to actually race towards the location in the map, taking advantage of the fact that the game is based on our campus   
  * Maybe more variable game difficulties using frame size (in like inches/meters of the object in the picture) so that users have more control over their game difficulty


---

## **Conclusion**

Harvard-Westlake GeoGuessr combines game design, user experience, and collaborative data collection into a single project. It creates an engaging way to explore campus while demonstrating thoughtful design decisions about usability, accuracy, and accessibility for contributors of all skill levels.

