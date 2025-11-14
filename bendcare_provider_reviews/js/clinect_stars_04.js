/*
 *  jQuery Plugin for Clinect scores star rating
 *  https://www.clinecthealthcare.com
 *
 *  Under MIT License
 */
;(function($, window, document, undefined) {
    "use strict";

    var animate = false;
    var rating_range_text = "";
    var rating_range_value = 0;
    var scale_factor = 1;
    var width_scale_factor = 0;

    var pluginName = "clinectStars",
        defaults = {
            itemId: 6,
            scoreType: 'provider',
            scoreValue: "88",
            responseCount: 122,
            groupId: "cnsa",
            clinectSurveyServicesURL: "https://api2.clinectsurvey.com/stats/",
            size: "small",
            halfStars: false,
            showTooltip: false,
            upperBounds: 5,
            responseCountFloor: 1,
            responseScoreFloor: 65,
            ratingPct: 43,
            animate: false,
            linkUrl: ''
        };

    // Plugin constructor
    function Plugin (element, options) {
        this.element = element;
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;

        // Pass reference to the outside functions
        animate = this.settings.animate;

        this.init();
    }

    // Avoid Plugin.prototype conflicts
    $.extend(Plugin.prototype, {
        init: function() {
            this.loadProviderScore(this.settings.itemId);
        },
        loadProviderScore: function(item_id) {
            // Start with the widget hidden in case we're below the floors
            $(".clinect-rating").hide();

            $(this.element).addClass("clinect-rating-"+this.settings.size);
            var $star_container = $('<div>', {
                id: "star-container-"+this.settings.itemId,
                class: this.settings.size + " star-container"
            });

            debugger;
            var $star_link = $('<a>', {
                href : this.settings.linkUrl.href,
                target: this.settings.linkUrl.target
            });

            var $star_background = $("<span>", {id: "rating-background-"+this.settings.itemId, class: this.settings.size + " clinect-rating-background"});
            var $score_overlay = $("<span>", {id: "rating-overlay-"+this.settings.itemId, class: this.settings.size + " clinect-rating-overlay", style: "width: 0%;"});
            var $range_tooltip = $("<span>",{id: "range_tooltip-"+this.settings.itemId, class: "tooltiptext"});

            $star_background.appendTo($star_container);
            $score_overlay.appendTo($star_background);

            var $ratings_reviews_block = $("<div>",{id: "ratings-reviews-block-"+this.settings.itemId, class: this.settings.size + " clinect-ratings-reviews-block"});
            var $star_qty = $("<div>",{id: "star-qty-"+this.settings.itemId, class: this.settings.size + " clinect-star-qty", "text":"0 stars"});
            var $reviews_qty = $("<span>",{id: "reviews-qty-"+this.settings.itemId, class: this.settings.size + " clinect-reviews-qty", "text":"0 reviews"});
            var $rating_qty = $("<span>",{id: "rating-qty-"+this.settings.itemId, class: this.settings.size + " clinect-rating-qty", "text":"0 ratings, "});

            $rating_qty.appendTo($ratings_reviews_block);
            $reviews_qty.appendTo($ratings_reviews_block);

            if(this.settings.showTooltip) {
                $range_tooltip.appendTo(this.element);
            }

            $star_container.appendTo(this.element);
            $star_qty.appendTo(this.element);
            $ratings_reviews_block.appendTo(this.element);

            // If we have a link for another page, wrap the container element in that anchor
            if(this.settings.linkUrl !== '') {
                $(this.element).wrap($star_link);
            }

            if(this.settings.clinectSurveyServicesURL !== null && this.settings.clinectSurveyServicesURL !== '') {
                if(this.settings.scoreType === 'provider') {
                    this.fetchProviderScore(this.settings.clinectSurveyServicesURL, item_id, this.settings.responseCountFloor, this.settings.responseScoreFloor);
                }
                if(this.settings.scoreType === 'location') {
                    this.fetchLocationScore(this.settings.clinectSurveyServicesURL, item_id, this.settings.responseCountFloor, this.settings.responseScoreFloor);
                }
            } else {
                this.updateScoreOverlay(item_id, this.settings.responseCount, this.settings.scoreValue);
                $(".clinect-rating").show();
            }
        },

        fetchProviderScore: function(stats_url, item_id, response_count_floor, response_score_floor) {
            $.ajax({
                context: this,
                method: "GET",
                url: stats_url+this.settings.groupId+"/provider-score/"+item_id
            }).done(function(return_msg) {
                debugger;
                var message = [];
                message = jQuery.parseJSON(return_msg);
                if(message.length !== 1) {
                    console.log('Too many providers/scores returned from request.');
                }
                if(message[0].response_count < response_count_floor || message[0].score_value < response_score_floor) {
                    console.log('Response floor or score value are outside of floor range.');
                    // Disable the widget
                    $(".clinect-rating").hide();
                } else {
                    $(".clinect-rating").show();
                    var score_value = message[0].score_value;
                    if(score_value > 100) {
                        score_value = 100;
                    }
                    this.updateScoreOverlay(message[0].provider_id, message[0].response_count, message[0].curated_response_count,score_value);
                }
            }).fail(function(return_msg) {
                console.log(return_msg);
            });
        },

        fetchLocationScore: function(stats_url, item_id, response_count_floor, response_score_floor) {
            $.ajax({
                context: this,
                method: "GET",
                url: stats_url+this.settings.groupId+"/location-score/"+item_id
            }).done(function(return_msg) {
                debugger;
                var message = [];
                message = jQuery.parseJSON(return_msg);
                if(message.length !== 1) {
                    console.log('Too many providers/scores returned from request.');
                }
                if(message[0].response_count < response_count_floor || message[0].score_value < response_score_floor) {
                    console.log('Response floor or score value are outside of floor range.');
                    // Disable the widget
                    $(".clinect-rating").hide();
                } else {
                    $(".clinect-rating").show();
                    var score_value = message[0].score_value;
                    if(score_value > 100) {
                        score_value = 100;
                    }
                    this.updateScoreOverlay(message[0].location_id, message[0].response_count, message[0].curated_response_count,score_value);
                }
            }).fail(function(return_msg) {
                console.log(return_msg);
            });
        },

        updateScoreOverlay: function(item_id,response_count,curated_response_count,score_value) {
            debugger;
            this.settings.ratingPct = score_value;
            rating_range_value = this.settings.upperBounds * (this.settings.ratingPct/100);
            // If we're doing half stars, we need to increment the sprite and the text by halves
            scale_factor = 1;
            width_scale_factor = scale_factor * 20;
            if(this.settings.halfStars) {
                scale_factor = 2;
                width_scale_factor = scale_factor * 10;
                rating_range_value = Math.round(rating_range_value * scale_factor) / scale_factor;
            }

            var width_pct = (rating_range_value*(width_scale_factor)*1.01) + "%";
            $("#"+$(this.element).attr('id') + " #"+"rating-qty-"+item_id).text(response_count.toLocaleString() + " ratings, ");
            $("#"+$(this.element).attr('id') + " #"+"reviews-qty-"+item_id).text(curated_response_count.toLocaleString() + " reviews");

            rating_range_text = (rating_range_value > 1) ? " stars" : " star";
            if(this.settings.showTooltip) {
                $(".tooltiptext").text(rating_range_value.toFixed(1) + rating_range_text);
            } else {
                rating_range_text = rating_range_value.toFixed(1) + ' out of ' + this.settings.upperBounds + ' stars';
                $("#" + $(this.element).attr('id') + " #" + "star-qty-" + item_id).text(rating_range_text);
            }


            if(this.settings.animate) {
                $("#"+$(this.element).attr('id') + " #"+"rating-overlay-"+item_id).animate({width: width_pct});
            } else {
                $("#"+$(this.element).attr('id') + " #"+"rating-overlay-"+item_id).width(width_pct);
            }
        }
    });

    // Prevent multiple instantiations
    $.fn[pluginName] = function(options) {
        return this.each(function() {
            if (!$.data(this, "plugin_" + pluginName)) {
                $.data(this, "plugin_" +
                    pluginName, new Plugin(this, options));
            }
        });
    };
})(jQuery, window, document);

function starsFromScore(size, upper_bounds, half_stars, response_id, score) {
    rating_range_value = upper_bounds * (score/100);
    // If we're doing half stars, we need to increment the sprite and the text by halves
    scale_factor = 1;
    width_scale_factor = scale_factor * 20;
    if(half_stars) {
        scale_factor = 2;
        width_scale_factor = scale_factor * 10;
        rating_range_value = Math.round(rating_range_value * scale_factor) / scale_factor;
    }

    var width_pct = rating_range_value*(width_scale_factor) + "%";

    // $(".clinect-rating-qty").text(response_count + " reviews");

    // rating_range_text = (rating_range_value > 1) ? " stars" : " star";
    // $(".tooltiptext").text(rating_range_value.toFixed(1)+rating_range_text);

    var star_background = '<div id="curated-rating-'+response_id+'" class="curated-rating '+size+'"><span id="rating-background-'+response_id+'" class="'+size+' clinect-rating-background">';
    var score_overlay = '<span id="rating-overlay-'+response_id+'" class="'+size+' clinect-rating-overlay" style="width: '+width_pct+'"></span></span></div>';

    return star_background + score_overlay;
}